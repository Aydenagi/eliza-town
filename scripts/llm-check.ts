// Runs one real task through the pipeline against the configured LLM provider and prints
// what happened. Usage: ANTHROPIC_API_KEY=... bun scripts/llm-check.ts
// Exits 0 on task_complete, 1 otherwise. Costs one planner, coder, and reviewer call.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.LLM_CHECK_PORT || 3911);
const outputDir = mkdtempSync(path.join(tmpdir(), 'eliza-town-llm-check-'));

const server = spawn('bun', ['src/server.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), OUTPUT_DIR: outputDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

function fail(message: string): never {
  console.error(`[llm-check] ${message}`);
  server.kill();
  process.exit(1);
}

async function waitForHealth(): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/api/health`);
      if (response.ok) return (await response.json()) as Record<string, unknown>;
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return fail('server never became healthy');
}

const health = await waitForHealth();
console.log('[llm-check] health', JSON.stringify(health));
if (health.engine !== 'llm') {
  fail(`expected engine=llm, got ${String(health.engine)}. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GROQ_API_KEY.`);
}

const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
const seen = new Set<string>();
const outcome = new Promise<{ type: string; task: Record<string, unknown> }>((resolve) => {
  ws.onmessage = (event) => {
    const frame = JSON.parse(String(event.data));
    seen.add(frame.type);
    if (frame.type === 'agent_speak') console.log(`[speak] ${frame.data.agentName}: ${String(frame.data.text).slice(0, 160)}`);
    if (frame.type === 'task_update') console.log(`[task] status=${frame.data.task.status}`);
    if (frame.type === 'file_created') console.log(`[file] ${frame.data.file.name} (${frame.data.file.size} bytes) by ${frame.data.agentId}`);
    if (frame.type === 'task_complete' || frame.type === 'task_failed') resolve({ type: frame.type, task: frame.data.task });
  };
});
await new Promise((resolve) => (ws.onopen = resolve));

const response = await fetch(`http://localhost:${PORT}/api/tasks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'llm-check' },
  body: JSON.stringify({
    title: process.env.LLM_CHECK_TITLE || 'Build a pomodoro timer web app',
    description:
      process.env.LLM_CHECK_DESCRIPTION ||
      'Single page. 25 minute work and 5 minute break cycles, start, pause, reset, shows completed cycles. Keep it small and clean.',
  }),
});
if (response.status !== 201) fail(`POST /api/tasks returned ${response.status}: ${await response.text()}`);
const created = (await response.json()) as { id: number; engine: string; provider: string };
console.log(`[llm-check] task ${created.id} engine=${created.engine} provider=${created.provider}`);

const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 12 minutes')), 12 * 60 * 1000));
try {
  const result = await Promise.race([outcome, timeout]);
  const task = result.task as { result: unknown; error: unknown; files: unknown; subtasks: Array<Record<string, unknown>> };
  console.log('[llm-check] outcome:', result.type);
  console.log('[llm-check] result:', JSON.stringify(task.result));
  if (task.error) console.log('[llm-check] error:', task.error);
  console.log('[llm-check] files:', JSON.stringify(task.files));
  console.log('[llm-check] subtasks:', JSON.stringify(task.subtasks.map((s) => [s.role, s.status, s.agentId, s.title])));
  console.log('[llm-check] events:', [...seen].join(', '));
  console.log('[llm-check] output dir:', outputDir);
  const preview = await fetch(`http://localhost:${PORT}/api/tasks/${created.id}/preview/`);
  console.log(`[llm-check] preview ${preview.status}, csp: ${preview.headers.get('content-security-policy')}`);
  process.exitCode = result.type === 'task_complete' ? 0 : 1;
} catch (error) {
  console.error('[llm-check] failed:', (error as Error).message);
  process.exitCode = 1;
} finally {
  ws.close();
  server.kill();
}
