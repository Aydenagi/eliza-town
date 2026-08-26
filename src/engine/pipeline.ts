import { complete } from '../llm/index.js';
import * as store from '../store/index.js';
import type { AgentRole, HubName } from '../types.js';
import {
  buildCoderPrompt,
  buildDesignPrompt,
  buildPlannerPrompt,
  buildReviewPrompt,
  parseCoderOutput,
  parsePlanOutput,
  parseVerdict,
  systemPromptFor,
} from './prompts.js';
import type { ParsedFile, StepRunner } from './prompts.js';
import type { ResolvedProvider } from '../llm/index.js';

const TASK_TIMEOUT_MS = 12 * 60 * 1000;
const PLAN_MAX_TOKENS = 8000;
const DESIGN_MAX_TOKENS = 8000;
const CODE_MAX_TOKENS = 32000;
const REVIEW_MAX_TOKENS = 8000;

export function createLLMStepRunner(provider: ResolvedProvider): StepRunner {
  async function call(role: AgentRole, username: string, prompt: string, maxTokens: number): Promise<string> {
    const system = await systemPromptFor(role, username);
    return complete({
      provider: provider.provider,
      apiKey: provider.apiKey,
      model: provider.model,
      system,
      prompt,
      maxTokens,
    });
  }

  return {
    async plan(task, agentUsername) {
      const text = await call('planner', agentUsername, buildPlannerPrompt(task), PLAN_MAX_TOKENS);
      return parsePlanOutput(text, task);
    },
    async design(task, subtask, agentUsername) {
      return call('designer', agentUsername, buildDesignPrompt(task, subtask), DESIGN_MAX_TOKENS);
    },
    async code(task, subtask, ctx, agentUsername) {
      const prompt = buildCoderPrompt(task, subtask, ctx);
      const text = await call('coder', agentUsername, prompt, CODE_MAX_TOKENS);
      return parseCoderOutput(text);
    },
    async review(task, designMd, files, agentUsername) {
      const text = await call('reviewer', agentUsername, buildReviewPrompt(task, designMd, files), REVIEW_MAX_TOKENS);
      return { markdown: text, verdict: parseVerdict(text) };
    },
  };
}

export interface PipelineHost {
  acquireAgent(role: AgentRole): Promise<string>;
  releaseAgent(username: string): Promise<void>;
  moveAgent(username: string, hub: HubName): Promise<void>;
  setWorking(username: string, doing: string): void;
  speak(username: string, taskId: number, text: string): Promise<void>;
  logStatus(taskId: number, agentUsername: string, text: string): Promise<void>;
  saveFile(taskId: number, path: string, content: string, agentUsername: string): Promise<void>;
  emitTaskEvent(taskId: number, type: 'task_update' | 'task_complete' | 'task_failed'): Promise<void>;
}

/**
 * Acquires an agent of the given role and guarantees it is released even if `fn` throws
 * (a bad key, a rate limit, a parse failure). Without this, a single failed task would
 * permanently strand that agent as "busy" and deadlock every task after it.
 */
async function withAgent<T>(host: PipelineHost, role: AgentRole, fn: (username: string) => Promise<T>): Promise<T> {
  const username = await host.acquireAgent(role);
  try {
    return await fn(username);
  } finally {
    await host.releaseAgent(username);
  }
}

function mergeFiles(existing: ParsedFile[], updated: ParsedFile[]): ParsedFile[] {
  const map = new Map(existing.map((f) => [f.path, f]));
  for (const f of updated) map.set(f.path, f);
  return [...map.values()];
}

async function saveFiles(
  host: PipelineHost,
  taskId: number,
  files: ParsedFile[],
  agentUsername: string
): Promise<string[]> {
  const saved: string[] = [];
  for (const file of files) {
    try {
      await host.saveFile(taskId, file.path, file.content, agentUsername);
      saved.push(file.path);
    } catch (error) {
      console.error(`[pipeline] Rejected file "${file.path}" for task ${taskId}: ${(error as Error).message}`);
    }
  }
  return saved;
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Task was cancelled.');
}

function timeoutAfter(ms: number, controller: AbortController): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Task timed out after ${Math.round(ms / 60000)} minutes.`);
      controller.abort(error);
      reject(error);
    }, ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

export async function runTask(taskId: number, runner: StepRunner, host: PipelineHost): Promise<void> {
  const controller = new AbortController();
  const timeout = timeoutAfter(TASK_TIMEOUT_MS, controller);
  try {
    // The abandoned `execute` keeps running after this race is lost (its in-flight LLM
    // call can't be interrupted), but it checks `signal` between steps and stops making
    // further progress or writes as soon as it can.
    await Promise.race([execute(taskId, runner, host, controller.signal), timeout.promise]);
  } catch (error) {
    await store.setTaskFields(taskId, { status: 'failed', error: (error as Error).message });
    await host.emitTaskEvent(taskId, 'task_failed');
  } finally {
    timeout.clear();
  }
}

async function execute(taskId: number, runner: StepRunner, host: PipelineHost, signal: AbortSignal): Promise<void> {
  const task = await store.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const taskLike = { title: task.title, description: task.description || '' };

  await store.updateTaskStatus(taskId, 'planning');
  await host.emitTaskEvent(taskId, 'task_update');

  const planResult = await withAgent(host, 'planner', async (plannerUsername) => {
    await host.moveAgent(plannerUsername, 'planning_room');
    host.setWorking(plannerUsername, 'Planning the approach');
    await host.logStatus(taskId, plannerUsername, `Started planning: ${task.title}`);

    const result = await runner.plan(taskLike, plannerUsername);

    await host.speak(plannerUsername, taskId, result.summary);
    await host.logStatus(taskId, plannerUsername, `Finished planning: ${task.title}`);
    return result;
  });

  assertNotAborted(signal);

  const subtaskRows: store.Subtask[] = [];
  for (let i = 0; i < planResult.subtasks.length; i++) {
    const s = planResult.subtasks[i];
    subtaskRows.push(await store.createSubtask(taskId, s.title, s.description, i, s.role));
  }
  await host.emitTaskEvent(taskId, 'task_update');

  let designMd: string | null = null;
  let files: ParsedFile[] = [];
  let reviewMd: string | null = null;

  for (const subtaskRow of subtaskRows) {
    assertNotAborted(signal);
    const role = (subtaskRow.role || 'coder') as AgentRole;
    const subtaskLike = { title: subtaskRow.title, description: subtaskRow.description || '' };

    if (role === 'designer') {
      await store.updateTaskStatus(taskId, 'designing');
      await store.updateSubtaskStatus(subtaskRow.id, 'in_progress');
      await host.emitTaskEvent(taskId, 'task_update');

      await withAgent(host, 'designer', async (username) => {
        await store.assignSubtaskAgent(subtaskRow.id, username);
        await host.moveAgent(username, 'design_studio');
        host.setWorking(username, subtaskRow.title);
        await host.logStatus(taskId, username, `Started: ${subtaskRow.title}`);

        designMd = await runner.design(taskLike, subtaskLike, username);
        await host.saveFile(taskId, 'DESIGN.md', designMd, username);
        await store.updateSubtaskStatus(subtaskRow.id, 'completed', designMd);

        await host.speak(username, taskId, `Design is ready for ${task.title}`);
        await host.logStatus(taskId, username, `Finished: ${subtaskRow.title}`);
      });

      await host.emitTaskEvent(taskId, 'task_update');
      continue;
    }

    if (role === 'coder') {
      await store.updateTaskStatus(taskId, 'coding');
      await store.updateSubtaskStatus(subtaskRow.id, 'in_progress');
      await host.emitTaskEvent(taskId, 'task_update');

      await withAgent(host, 'coder', async (username) => {
        await store.assignSubtaskAgent(subtaskRow.id, username);
        await host.moveAgent(username, 'coding_desk');
        host.setWorking(username, subtaskRow.title);
        await host.logStatus(taskId, username, `Started: ${subtaskRow.title}`);

        const result = await runner.code(taskLike, subtaskLike, { designMd, reviewMd, currentFiles: files }, username);
        const saved = await saveFiles(host, taskId, result.files, username);
        files = mergeFiles(files, result.files.filter((f) => saved.includes(f.path)));

        await store.updateSubtaskStatus(subtaskRow.id, 'completed', result.notes || saved.join(', '));
        await host.speak(username, taskId, saved.length ? `Wrote ${saved.join(', ')}` : 'No files were produced.');
        await host.logStatus(taskId, username, `Finished: ${subtaskRow.title}`);
      });

      await host.emitTaskEvent(taskId, 'task_update');
      continue;
    }

    if (role === 'reviewer') {
      await store.updateTaskStatus(taskId, 'reviewing');
      await store.updateSubtaskStatus(subtaskRow.id, 'in_progress');
      await host.emitTaskEvent(taskId, 'task_update');

      const verdict = await withAgent(host, 'reviewer', async (username) => {
        await store.assignSubtaskAgent(subtaskRow.id, username);
        await host.moveAgent(username, 'review_station');
        host.setWorking(username, subtaskRow.title);
        await host.logStatus(taskId, username, `Started: ${subtaskRow.title}`);

        const reviewResult = await runner.review(taskLike, designMd, files, username);
        reviewMd = reviewResult.markdown;
        await host.saveFile(taskId, 'REVIEW.md', reviewMd, username);
        await host.speak(username, taskId, `Review verdict: ${reviewResult.verdict}`);
        await store.updateSubtaskStatus(subtaskRow.id, 'completed', reviewMd);
        await host.logStatus(taskId, username, `Finished: ${subtaskRow.title}`);
        return reviewResult.verdict;
      });

      if (verdict === 'revise') {
        assertNotAborted(signal);
        await store.updateTaskStatus(taskId, 'coding');
        await host.emitTaskEvent(taskId, 'task_update');

        await withAgent(host, 'coder', async (coderUsername) => {
          await host.moveAgent(coderUsername, 'coding_desk');
          host.setWorking(coderUsername, 'Fixing review feedback');
          await host.logStatus(taskId, coderUsername, 'Started: fix round');

          const fixResult = await runner.code(taskLike, subtaskLike, { designMd, reviewMd, currentFiles: files }, coderUsername);
          const savedFix = await saveFiles(host, taskId, fixResult.files, coderUsername);
          files = mergeFiles(files, fixResult.files.filter((f) => savedFix.includes(f.path)));

          await host.speak(coderUsername, taskId, savedFix.length ? `Updated ${savedFix.join(', ')}` : 'No changes were made.');
          await host.logStatus(taskId, coderUsername, 'Finished: fix round');
        });
      }
      continue;
    }
  }

  assertNotAborted(signal);

  const previewUrl = files.some((f) => f.path === 'index.html') ? `/api/tasks/${taskId}/preview/` : null;
  await store.setTaskFields(taskId, {
    status: 'completed',
    result_summary: planResult.summary,
    preview_url: previewUrl,
    completed_at: new Date(),
  });
  await host.emitTaskEvent(taskId, 'task_complete');
}
