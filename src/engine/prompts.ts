import { ELIZA_TOWN_CHARACTERS } from '../characters.js';
import * as store from '../store/index.js';
import type { AgentRole } from '../types.js';

export interface PlannedSubtask {
  role: AgentRole;
  title: string;
  description: string;
}

export interface PlanResult {
  summary: string;
  subtasks: PlannedSubtask[];
}

export interface ParsedFile {
  path: string;
  content: string;
}

export interface CoderResult {
  files: ParsedFile[];
  notes: string;
}

export interface TaskLike {
  title: string;
  description: string;
}

export interface SubtaskLike {
  title: string;
  description: string;
}

export interface ReviewResult {
  markdown: string;
  verdict: 'approve' | 'revise';
}

export interface CodeContext {
  designMd: string | null;
  reviewMd: string | null;
  currentFiles: ParsedFile[];
}

export interface StepRunner {
  plan(task: TaskLike, agentUsername: string): Promise<PlanResult>;
  design(task: TaskLike, subtask: SubtaskLike, agentUsername: string): Promise<string>;
  code(task: TaskLike, subtask: SubtaskLike, ctx: CodeContext, agentUsername: string): Promise<CoderResult>;
  review(task: TaskLike, designMd: string | null, files: ParsedFile[], agentUsername: string): Promise<ReviewResult>;
}

async function agentProfile(username: string): Promise<{ name: string; bio: string; personality: string }> {
  const character = ELIZA_TOWN_CHARACTERS.find((c) => c.username === username);
  if (!character) throw new Error(`Unknown agent username "${username}"`);
  const row = await store.getAgentByUsername(username);
  return {
    name: character.name,
    bio: character.bio.join(' '),
    personality: row?.personality || character.adjectives.join(', '),
  };
}

const ROLE_BLOCKS: Record<AgentRole, string> = {
  planner: `You are the lead planner. Given a task, break it into 2 to 5 subtasks.

Respond with a single fenced json code block and nothing else outside it:

\`\`\`json
{
  "summary": "one sentence describing your plan",
  "subtasks": [
    { "role": "designer", "title": "...", "description": "..." },
    { "role": "coder", "title": "...", "description": "..." },
    { "role": "reviewer", "title": "...", "description": "..." }
  ]
}
\`\`\`

Rules: at most one designer subtask, at least one coder subtask, exactly one reviewer subtask and it must be last, the coder subtask must come before the reviewer subtask. Only include a designer subtask when the task benefits from an explicit design pass.`,

  designer: `You are the designer. Write a short design document in plain markdown for the coder to implement.
Cover: what is being built, the structure of the output, and any interface or data decisions. Keep it concrete
and short enough that a coder can follow it directly. Do not write code, write the plan for the code.`,

  coder: `You are the coder. Produce the actual files for this task.

Output ONLY file blocks in this exact format (you may add a short note before the first block, nothing else):

=== FILE: relative/path.ext ===
<full file content>
=== END FILE ===

Repeat the block for every file. For anything web-facing, produce a single self-contained index.html with
inline CSS and JS (no CDN links, no external resources) so it can be previewed immediately. Otherwise produce
runnable source files plus a README.md explaining how to run them. Every path must be a flat filename with
no directories: use "app.js" or "utils.js", never "src/app.js" or "lib/utils.js".`,

  reviewer: `You are the reviewer. Read the design (if any) and the files and write a short markdown review:
what works, what is weak or missing, and whether it's ready to ship. The LAST LINE of your response must be
exactly one of:
VERDICT: approve
VERDICT: revise`,
};

export async function systemPromptFor(role: AgentRole, username: string): Promise<string> {
  const profile = await agentProfile(username);
  return `You are ${profile.name}. ${profile.bio}\nYour personality: ${profile.personality}.\n\n${ROLE_BLOCKS[role]}`;
}

export function buildPlannerPrompt(task: TaskLike): string {
  return `Task title: ${task.title}\n\nTask description:\n${task.description || '(no additional description provided)'}`;
}

export function buildDesignPrompt(task: TaskLike, subtask: SubtaskLike): string {
  return `Main task: ${task.title}\n${task.description}\n\nYour subtask: ${subtask.title}\n${subtask.description}`;
}

export function buildCoderPrompt(
  task: TaskLike,
  subtask: SubtaskLike,
  context: { designMd?: string | null; reviewMd?: string | null; currentFiles?: ParsedFile[] }
): string {
  const parts = [`Main task: ${task.title}\n${task.description}`, `Your subtask: ${subtask.title}\n${subtask.description}`];

  if (context.designMd) {
    parts.push(`DESIGN.md:\n${context.designMd}`);
  }

  if (context.reviewMd) {
    parts.push(`The reviewer asked for changes. REVIEW.md:\n${context.reviewMd}`);
    if (context.currentFiles?.length) {
      const currentFilesText = context.currentFiles
        .map((f) => `=== FILE: ${f.path} ===\n${f.content}\n=== END FILE ===`)
        .join('\n\n');
      parts.push(`Current files (fix these, re-emit every file that needs to change):\n${currentFilesText}`);
    }
  }

  return parts.join('\n\n');
}

export function buildReviewPrompt(task: TaskLike, designMd: string | null, files: ParsedFile[]): string {
  const parts = [`Main task: ${task.title}\n${task.description}`];
  if (designMd) parts.push(`DESIGN.md:\n${designMd}`);
  const filesText = files.map((f) => `=== FILE: ${f.path} ===\n${f.content}\n=== END FILE ===`).join('\n\n');
  parts.push(`Files:\n${filesText}`);
  return parts.join('\n\n');
}

const VALID_ROLES: AgentRole[] = ['designer', 'coder', 'reviewer'];

function looksLikeBuildTask(title: string): boolean {
  return /\b(build|create|design|app|site|page)\b/i.test(title);
}

function fallbackPlan(task: TaskLike): PlanResult {
  const subtasks: PlannedSubtask[] = [];
  if (looksLikeBuildTask(task.title)) {
    subtasks.push({ role: 'designer', title: `Design: ${task.title}`, description: 'Sketch the structure before implementation.' });
  }
  subtasks.push({ role: 'coder', title: `Implement: ${task.title}`, description: task.description || task.title });
  subtasks.push({ role: 'reviewer', title: `Review: ${task.title}`, description: 'Check the implementation for correctness and completeness.' });
  return { summary: `Break down and implement: ${task.title}`, subtasks };
}

function normalizePlan(plan: PlanResult, task: TaskLike): PlanResult {
  let subtasks = plan.subtasks.filter(
    (s) => VALID_ROLES.includes(s.role) && typeof s.title === 'string' && s.title.trim().length > 0
  );

  const designers = subtasks.filter((s) => s.role === 'designer');
  if (designers.length > 1) {
    const [first] = designers;
    subtasks = subtasks.filter((s) => s.role !== 'designer' || s === first);
  }

  if (!subtasks.some((s) => s.role === 'coder')) {
    subtasks.push({ role: 'coder', title: `Implement: ${task.title}`, description: task.description || task.title });
  }

  subtasks = subtasks.filter((s) => s.role !== 'reviewer');
  subtasks.push({ role: 'reviewer', title: `Review: ${task.title}`, description: 'Check the implementation for correctness and completeness.' });

  const designer = subtasks.find((s) => s.role === 'designer');
  const coders = subtasks.filter((s) => s.role === 'coder');
  const reviewer = subtasks[subtasks.length - 1];
  const ordered = [...(designer ? [designer] : []), ...coders, reviewer];

  return {
    summary: plan.summary || `Break down and implement: ${task.title}`,
    subtasks: ordered.slice(0, 5),
  };
}

export function defaultPlanFor(task: TaskLike): PlanResult {
  return normalizePlan(fallbackPlan(task), task);
}

export function parsePlanOutput(text: string, task: TaskLike): PlanResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return normalizePlan(fallbackPlan(task), task);
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      summary?: unknown;
      subtasks?: Array<{ role?: unknown; title?: unknown; description?: unknown }>;
    };
    const subtasks: PlannedSubtask[] = Array.isArray(parsed.subtasks)
      ? parsed.subtasks
          .filter((s) => typeof s.role === 'string' && typeof s.title === 'string')
          .map((s) => ({
            role: s.role as AgentRole,
            title: String(s.title),
            description: typeof s.description === 'string' ? s.description : '',
          }))
      : [];
    if (subtasks.length === 0) return normalizePlan(fallbackPlan(task), task);
    return normalizePlan({ summary: typeof parsed.summary === 'string' ? parsed.summary : '', subtasks }, task);
  } catch {
    return normalizePlan(fallbackPlan(task), task);
  }
}

const FILE_BLOCK_RE = /===\s*FILE:\s*(.+?)\s*===[ \t]*\r?\n([\s\S]*?)\r?\n?=== END FILE ===/g;

export function parseCoderOutput(text: string): CoderResult {
  const files: ParsedFile[] = [];
  const firstMatch = text.search(/===\s*FILE:/);
  const notes = firstMatch > 0 ? text.slice(0, firstMatch).trim() : '';

  let match: RegExpExecArray | null;
  FILE_BLOCK_RE.lastIndex = 0;
  while ((match = FILE_BLOCK_RE.exec(text)) !== null) {
    files.push({ path: match[1].trim(), content: match[2] });
  }

  return { files, notes };
}

export function parseVerdict(text: string): 'approve' | 'revise' {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] || '';
  const match = /^VERDICT:\s*(approve|revise)$/i.exec(last);
  return match ? (match[1].toLowerCase() as 'approve' | 'revise') : 'approve';
}
