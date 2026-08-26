#!/usr/bin/env bun
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import WebSocket from 'ws';

function log(msg: string): void {
  console.log(`[smoke] ${msg}`);
}

function fail(msg: string): never {
  throw new Error(msg);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not allocate a free port'));
      }
    });
    srv.on('error', reject);
  });
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const body = (await res.json()) as { engine?: string };
        if (body.engine === 'simulation') return;
        fail(`Expected engine "simulation" with no keys configured, got "${body.engine}"`);
      }
    } catch {
      // Server not accepting connections yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`Server did not report healthy within ${timeoutMs}ms`);
}

async function testStoragePathValidation(): Promise<void> {
  const storage = await import('../src/storage/index.js');
  const badPaths = ['../escape.txt', '/etc/passwd', 'nested/../../escape.txt'];
  for (const badPath of badPaths) {
    let threw = false;
    try {
      await storage.saveTaskFile('smoke-validation', badPath, 'should not be written');
    } catch {
      threw = true;
    }
    if (!threw) fail(`storage.saveTaskFile("${badPath}") should have thrown`);
  }
  log('storage path validation rejects traversal and absolute paths');
}

interface WsFrame {
  type: string;
  data: Record<string, unknown>;
}

async function runServerLifecycleChecks(): Promise<void> {
  const port = await freePort();
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eliza-town-smoke-'));
  const baseUrl = `http://localhost:${port}`;
  const repoRoot = path.join(import.meta.dir, '..');

  const child = Bun.spawn(['bun', 'src/server.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      OUTPUT_DIR: outputDir,
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GROQ_API_KEY: '',
      DATABASE_URL: '',
      DEMO_MODE: 'false',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let ws: WebSocket | null = null;

  try {
    await waitForHealth(baseUrl, 20_000);
    log('server is healthy in simulation mode');

    ws = new WebSocket(`ws://localhost:${port}/ws`);
    const socket = ws;

    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });
    log('websocket connected');

    const seenEvents = new Set<string>();
    let taskId: number | null = null;

    const lifecycleDone = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the task to reach task_complete')), 90_000);
      socket.on('message', (raw: Buffer) => {
        let frame: WsFrame;
        try {
          frame = JSON.parse(raw.toString());
        } catch {
          return;
        }
        seenEvents.add(frame.type);
        if (frame.type === 'task_created') {
          const task = frame.data.task as { id: number };
          taskId = task.id;
        }
        if (frame.type === 'task_complete') {
          clearTimeout(timer);
          resolve();
        }
        if (frame.type === 'task_failed') {
          clearTimeout(timer);
          const task = frame.data.task as { error?: string };
          reject(new Error(`Task failed instead of completing: ${task.error}`));
        }
      });
    });

    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'smoke-session' },
      body: JSON.stringify({ title: 'Build a tiny test page', description: 'A smoke-test task.' }),
    });
    if (createRes.status !== 201) fail(`POST /api/tasks returned ${createRes.status}, expected 201`);
    const created = (await createRes.json()) as { id: number };
    taskId = created.id;
    log(`created task ${taskId}`);

    await lifecycleDone;

    for (const required of ['task_created', 'agent_move', 'file_created', 'task_complete']) {
      if (!seenEvents.has(required)) fail(`Never saw the "${required}" WebSocket event`);
    }
    log(`saw required WebSocket events: ${[...seenEvents].join(', ')}`);

    if (taskId === null) fail('Never captured a task id from task_created');

    const filesRes = await fetch(`${baseUrl}/api/tasks/${taskId}/files`);
    if (!filesRes.ok) fail(`GET /api/tasks/${taskId}/files returned ${filesRes.status}`);
    const files = (await filesRes.json()) as Array<{ name: string }>;
    if (!Array.isArray(files) || files.length === 0) fail('Expected at least one output file for the task');
    log(`task produced files: ${files.map((f) => f.name).join(', ')}`);

    const previewRes = await fetch(`${baseUrl}/api/tasks/${taskId}/preview/`);
    if (previewRes.status !== 200) fail(`GET /api/tasks/${taskId}/preview/ returned ${previewRes.status}`);
    const csp = previewRes.headers.get('content-security-policy') || '';
    if (!csp.includes('sandbox')) fail(`Preview response missing sandbox CSP header, got "${csp}"`);
    log('preview route returns 200 with a sandbox CSP header');
  } finally {
    ws?.close();
    child.kill();
    rmSync(outputDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testStoragePathValidation();
  await runServerLifecycleChecks();
  log('ALL CHECKS PASSED');
}

main().catch((error) => {
  console.error('[smoke] FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
