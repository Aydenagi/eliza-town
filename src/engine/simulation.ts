import { defaultPlanFor } from './prompts.js';
import type { CodeContext, CoderResult, PlanResult, ReviewResult, StepRunner, SubtaskLike, TaskLike } from './prompts.js';

const NOTICE =
  'Simulated result. No LLM key was configured. Add ANTHROPIC_API_KEY on the server or paste your own key in the town\'s API key box to get real output.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function watchableDelay(): Promise<void> {
  return sleep(4000 + Math.random() * 4000);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function plan(task: TaskLike, _agentUsername: string): Promise<PlanResult> {
  await watchableDelay();
  const base = defaultPlanFor(task);
  return { ...base, summary: `Simulated plan for "${task.title}": ${base.summary}` };
}

async function design(task: TaskLike, subtask: SubtaskLike, _agentUsername: string): Promise<string> {
  await watchableDelay();
  return [
    `# Design: ${task.title}`,
    '',
    NOTICE,
    '',
    `This is a placeholder design note for "${subtask.title}". A real design pass would describe the`,
    'structure, interfaces, and data flow needed to build this task.',
  ].join('\n');
}

async function code(task: TaskLike, _subtask: SubtaskLike, _ctx: CodeContext, _agentUsername: string): Promise<CoderResult> {
  await watchableDelay();
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(task.title)}</title>`,
    '<style>',
    'body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; }',
    'h1 { font-size: 1.5rem; }',
    '.notice { background: #fff3cd; border: 1px solid #ffe69c; padding: 1rem; border-radius: 6px; margin-top: 1.5rem; }',
    '</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(task.title)}</h1>`,
    `<p>${escapeHtml(task.description || 'No description was provided.')}</p>`,
    `<div class="notice">${escapeHtml(NOTICE)}</div>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');

  const readme = [`# ${task.title}`, '', NOTICE, ''].join('\n');

  return {
    files: [
      { path: 'index.html', content: html },
      { path: 'README.md', content: readme },
    ],
    notes: '',
  };
}

async function review(
  _task: TaskLike,
  _designMd: string | null,
  _files: unknown[],
  _agentUsername: string
): Promise<ReviewResult> {
  await watchableDelay();
  return {
    markdown: ['# Review', '', NOTICE, '', 'This is a simulated review with no real analysis.', '', 'VERDICT: approve'].join('\n'),
    verdict: 'approve',
  };
}

export function createSimulationRunner(): StepRunner {
  return { plan, design, code, review };
}
