import { Router, Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { config } from '../config.js';
import * as storage from '../storage/index.js';
import type { Agent as WireAgent, Task as WireTask } from '../types.js';
import type { ByokCredentials } from '../llm/index.js';

export interface HealthInfo {
  engine: 'llm' | 'simulation' | 'eliza';
  provider: 'anthropic' | 'openai' | 'groq' | null;
  model: string | null;
  byok: boolean;
  storage: 'memory' | 'postgres';
  agents: number;
  queue: number;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: number;
  sessionId: string;
  byok: ByokCredentials | null;
}

export interface EngineFacade {
  listAgents(): Promise<WireAgent[]>;
  getAgent(username: string): Promise<WireAgent | null>;
  updateAgent(
    username: string,
    fields: { name?: string; personality?: string; capabilities?: string[] }
  ): Promise<WireAgent | null>;
  listTasks(sessionId: string | null): Promise<WireTask[]>;
  getTask(id: number, sessionId: string | null): Promise<WireTask | null>;
  createTask(input: CreateTaskInput): Promise<WireTask>;
  queueLength(): Promise<number>;
  health(): Promise<HealthInfo>;
  recentMessages(limit: number): Promise<unknown[]>;
}

const RATE_LIMIT_HITS = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (RATE_LIMIT_HITS.get(ip) || []).filter((t) => now - t < config.taskRateWindowMs);
  if (hits.length >= config.taskRateLimit) {
    RATE_LIMIT_HITS.set(ip, hits);
    return true;
  }
  hits.push(now);
  RATE_LIMIT_HITS.set(ip, hits);
  return false;
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function sessionId(req: Request): string | null {
  const value = req.headers['x-session-id'];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function byokFromHeaders(req: Request): ByokCredentials | null {
  const provider = req.headers['x-llm-provider'];
  const key = req.headers['x-llm-key'];
  if (typeof provider !== 'string' || typeof key !== 'string' || !provider.trim() || !key.trim()) return null;
  const model = req.headers['x-llm-model'];
  return { provider: provider.trim(), apiKey: key.trim(), model: typeof model === 'string' ? model.trim() : undefined };
}

export function createApiRouter(facade: EngineFacade): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const health = await facade.health();
    res.json({ status: 'ok', ...health, timestamp: Date.now() });
  });

  router.get('/agents', async (_req: Request, res: Response) => {
    res.json(await facade.listAgents());
  });

  router.get('/agents/:id', async (req: Request, res: Response) => {
    const agent = await facade.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  });

  router.patch('/agents/:id', async (req: Request, res: Response) => {
    const { name, personality, capabilities } = req.body as {
      name?: string;
      personality?: string;
      capabilities?: string[];
    };
    if (capabilities !== undefined && !Array.isArray(capabilities)) {
      res.status(400).json({ error: 'capabilities must be an array of strings' });
      return;
    }
    const agent = await facade.updateAgent(req.params.id, { name, personality, capabilities });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  });

  router.get('/tasks', async (req: Request, res: Response) => {
    res.json(await facade.listTasks(sessionId(req)));
  });

  router.post('/tasks', async (req: Request, res: Response) => {
    const session = sessionId(req);
    if (!session) {
      res.status(400).json({ error: 'X-Session-Id header is required', hint: 'Send a stable per-browser id in X-Session-Id.' });
      return;
    }

    const { title, description, priority } = req.body as { title?: string; description?: string; priority?: number };
    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    // Rate-limit after validating input, so malformed requests can't burn a client's quota.
    if (isRateLimited(clientIp(req))) {
      res.status(429).json({
        error: 'Rate limited',
        hint: `Max ${config.taskRateLimit} tasks per ${Math.round(config.taskRateWindowMs / 60000)} minutes. Try again later.`,
      });
      return;
    }

    if ((await facade.queueLength()) >= config.maxQueue) {
      res.status(429).json({ error: 'Queue is full', hint: `Max ${config.maxQueue} queued tasks. Try again shortly.` });
      return;
    }

    const byok = byokFromHeaders(req);
    if (byok && !config.allowByok) {
      res.status(400).json({ error: 'Bring-your-own-key is disabled on this server', hint: 'Set ALLOW_BYOK=true to enable it.' });
      return;
    }

    const task = await facade.createTask({
      title: title.trim(),
      description: typeof description === 'string' ? description : '',
      priority: typeof priority === 'number' && Number.isFinite(priority) ? priority : 5,
      sessionId: session,
      byok,
    });

    res.status(201).json(task);
  });

  router.get('/tasks/:id', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid task id' });
      return;
    }
    const task = await facade.getTask(id, sessionId(req));
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  });

  router.get('/tasks/:id/files', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid task id' });
      return;
    }
    res.json(await storage.listTaskFiles(id));
  });

  router.get('/tasks/:id/files/:name', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid task id' });
      return;
    }
    try {
      const content = await storage.readTaskFile(id, req.params.name);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.name.replace(/"/g, '')}"`);
      res.send(content);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  router.get(/^\/tasks\/(\d+)\/preview(\/.*)?$/, async (req: Request, res: Response) => {
    const id = Number(req.params[0]);
    const rest = (req.params[1] || '').replace(/^\/+/, '');
    const relativePath = rest || 'index.html';

    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      res.status(400).json({ error: 'Invalid preview path' });
      return;
    }

    const dir = storage.taskDir(id);
    const resolved = path.join(dir, relativePath);
    if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
      res.status(400).json({ error: 'Invalid preview path' });
      return;
    }

    try {
      await fs.access(resolved);
    } catch {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-modals allow-popups');
    res.sendFile(resolved, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: 'Not found' });
      }
    });
  });

  router.get('/messages', async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 50;
    res.json(await facade.recentMessages(limit));
  });

  router.get('/state', async (req: Request, res: Response) => {
    const [agents, tasks, messages] = await Promise.all([
      facade.listAgents(),
      facade.listTasks(sessionId(req)),
      facade.recentMessages(50),
    ]);
    res.json({ agents, tasks, messages });
  });

  return router;
}
