import { ELIZA_TOWN_CHARACTERS, HUBS, ROLE_HUBS } from '../characters.js';
import { config } from '../config.js';
import type { ByokCredentials, ResolvedProvider } from '../llm/index.js';
import { resolveProvider } from '../llm/index.js';
import * as storage from '../storage/index.js';
import * as store from '../store/index.js';
import type { Task as StoreTask, Message as StoreMessage } from '../store/index.js';
import type {
  Agent as WireAgent,
  AgentRole,
  AgentStatus,
  HubName,
  Message as WireMessage,
  MessageType,
  StateSnapshot,
  Task as WireTask,
  TaskStatus,
} from '../types.js';
import { randomDemoTask } from './demo.js';
import { createLLMStepRunner, runTask } from './pipeline.js';
import type { PipelineHost } from './pipeline.js';
import { createSimulationRunner } from './simulation.js';
import * as ws from '../websocket/index.js';

interface LiveAgent {
  username: string;
  name: string;
  role: AgentRole;
  modelId: string;
  storeId: number;
  hub: HubName;
  status: AgentStatus;
  doing: string | null;
  busy: boolean;
  nextAmbientAt: number;
}

const AMBIENT_LINES: Record<AgentRole, string[]> = {
  planner: ['Reviewing the queue.', 'Thinking about priorities.', 'Taking a short walk around town.'],
  designer: ['Sketching some ideas.', 'Looking for inspiration.', 'Stretching my legs for a minute.'],
  coder: ['Thinking through an edge case.', 'Taking a quick break.', 'Grabbing coffee before the next task.'],
  reviewer: ['Double-checking old notes.', 'Walking the town square.', 'Reading up on best practices.'],
};

const agents = new Map<string, LiveAgent>();
const usernameByStoreId = new Map<number, string>();
const runningTasks = new Set<number>();
const taskProviders = new Map<number, ResolvedProvider>();

let lastSnapshot: StateSnapshot = { agents: [], tasks: [], messages: [] };
let stateTimer: ReturnType<typeof setInterval> | null = null;
let ambientTimer: ReturnType<typeof setInterval> | null = null;
let demoTimer: ReturnType<typeof setInterval> | null = null;
let pumping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function broadcastFrame(type: string, data: Record<string, unknown>): void {
  ws.broadcast(type, data);
}

function hubDistance(a: HubName, b: HubName): number {
  const from = HUBS[a];
  const to = HUBS[b];
  return Math.sqrt((from.x - to.x) ** 2 + (from.z - to.z) ** 2);
}

async function moveAgent(agent: LiveAgent, targetHub: HubName): Promise<void> {
  if (agent.hub === targetHub) return;
  const from = agent.hub;
  const travelMs = Math.max(1500, hubDistance(from, targetHub) * 90);
  agent.status = 'traveling';
  broadcastFrame('agent_status', { agentId: agent.username, status: agent.status, doing: agent.doing });
  broadcastFrame('agent_move', { agentId: agent.username, agentName: agent.name, from, to: targetHub, travelMs });
  await sleep(travelMs);
  agent.hub = targetHub;
  broadcastFrame('agent_arrived', { agentId: agent.username, hub: targetHub });
}

function setAgentStatus(agent: LiveAgent, status: AgentStatus, doing: string | null): void {
  agent.status = status;
  agent.doing = doing;
  broadcastFrame('agent_status', { agentId: agent.username, status, doing });
}

async function acquireAgent(role: AgentRole): Promise<string> {
  for (;;) {
    // status === 'idle' (not just !busy) so a task can't grab an agent mid-walk-home
    // from releaseAgent, or mid-wander from ambientWander, and start a second moveAgent.
    const candidate = [...agents.values()].find((a) => a.role === role && !a.busy && a.status === 'idle');
    if (candidate) {
      candidate.busy = true;
      return candidate.username;
    }
    await sleep(300);
  }
}

async function releaseAgent(username: string): Promise<void> {
  const agent = agents.get(username);
  if (!agent) return;
  // Stay busy until the walk home finishes, so acquireAgent can't hand this agent to
  // another task while it's still mid-move.
  await moveAgent(agent, 'town_square');
  setAgentStatus(agent, 'idle', null);
  agent.busy = false;
}

async function speak(username: string, taskId: number | null, text: string): Promise<void> {
  const agent = agents.get(username);
  if (!agent) return;
  broadcastFrame('agent_speak', { agentId: agent.username, agentName: agent.name, text, type: 'saying', taskId });
  await store.createMessage(agent.storeId, 'saying', text, taskId);
}

async function logStatus(taskId: number, username: string, text: string): Promise<void> {
  const agent = agents.get(username);
  if (!agent) return;
  await store.createMessage(agent.storeId, 'status', text, taskId);
}

async function saveFile(taskId: number, filePath: string, content: string, agentUsername: string): Promise<void> {
  await storage.saveTaskFile(taskId, filePath, content);
  const size = Buffer.byteLength(content, 'utf-8');
  await store.addTaskFile(taskId, { name: filePath, size });
  broadcastFrame('file_created', { taskId, agentId: agentUsername, file: { name: filePath, size } });
}

async function emitTaskEvent(taskId: number, type: 'task_update' | 'task_complete' | 'task_failed'): Promise<void> {
  const row = await store.getTask(taskId);
  if (!row) return;
  const wire = await toWireTask(row);
  broadcastFrame(type, { task: wire });
}

const pipelineHost: PipelineHost = {
  acquireAgent,
  releaseAgent,
  moveAgent: (username, hub) => {
    const agent = agents.get(username);
    if (!agent) return Promise.resolve();
    return moveAgent(agent, hub);
  },
  setWorking: (username, doing) => {
    const agent = agents.get(username);
    if (agent) setAgentStatus(agent, 'working', doing);
  },
  speak: (username, taskId, text) => speak(username, taskId, text),
  logStatus,
  saveFile,
  emitTaskEvent,
};

async function toWireAgent(agent: LiveAgent): Promise<WireAgent> {
  const row = await store.getAgentByUsername(agent.username);
  const capabilities = (row?.capabilities || '').split(',').map((c) => c.trim()).filter(Boolean);
  return {
    id: agent.username,
    name: agent.name,
    type: agent.role,
    status: agent.status,
    current_hub: agent.hub,
    doing: agent.doing,
    model_id: agent.modelId,
    personality: row?.personality || '',
    capabilities,
  };
}

async function toWireTask(row: StoreTask, sessionId: string | null = null): Promise<WireTask> {
  const subtaskRows = await store.getSubtasks(row.id);
  const files = await storage.listTaskFiles(row.id);

  let queuePosition: number | null = null;
  if (row.status === 'queued') {
    const queued = await store.getTasks('queued');
    const idx = queued.findIndex((t) => t.id === row.id);
    queuePosition = idx === -1 ? null : idx + 1;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status as TaskStatus,
    priority: row.priority,
    sessionId: row.session_id,
    mine: sessionId ? row.session_id === sessionId : undefined,
    engine: row.engine === 'llm' ? 'llm' : 'simulation',
    provider: (row.provider as WireTask['provider']) || null,
    queuePosition,
    subtasks: subtaskRows.map((s) => ({
      id: s.id,
      role: (s.role as AgentRole) || 'coder',
      title: s.title,
      description: s.description || '',
      status: s.status as WireTask['subtasks'][number]['status'],
      agentId: s.agent_username,
      output: s.output,
    })),
    files,
    result: row.result_summary ? { summary: row.result_summary, previewUrl: row.preview_url } : null,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

async function toWireMessage(row: StoreMessage): Promise<WireMessage> {
  const username = usernameByStoreId.get(row.agent_id) || String(row.agent_id);
  return {
    id: row.id,
    agentId: username,
    agentName: row.agent_name || username,
    type: (row.type as MessageType) || 'saying',
    content: row.content,
    taskId: row.task_id,
    createdAt: row.created_at.toISOString(),
  };
}

async function buildSnapshot(): Promise<StateSnapshot> {
  const wireAgents = await Promise.all([...agents.values()].map(toWireAgent));
  const taskRows = await store.listTasksNewestFirst();
  const wireTasks = await Promise.all(taskRows.map((r) => toWireTask(r)));
  const messageRows = await store.getRecentMessages(50);
  const wireMessages = await Promise.all(messageRows.map(toWireMessage));
  return { agents: wireAgents, tasks: wireTasks, messages: wireMessages };
}

async function refreshAndBroadcastState(): Promise<void> {
  lastSnapshot = await buildSnapshot();
  broadcastFrame('state_update', lastSnapshot as unknown as Record<string, unknown>);
}

async function broadcastQueuePositions(): Promise<void> {
  const queued = await store.getTasks('queued');
  for (const row of queued) {
    broadcastFrame('task_update', { task: await toWireTask(row) });
  }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (runningTasks.size < config.maxConcurrentTasks) {
      const queued = await store.getTasks('queued');
      const next = queued.find((t) => !runningTasks.has(t.id));
      if (!next) break;

      runningTasks.add(next.id);
      const provider = taskProviders.get(next.id);
      const runner = next.engine === 'llm' && provider ? createLLMStepRunner(provider) : createSimulationRunner();

      runTask(next.id, runner, pipelineHost).finally(() => {
        runningTasks.delete(next.id);
        taskProviders.delete(next.id);
        pump();
      });
    }
    await broadcastQueuePositions();
  } finally {
    pumping = false;
  }
}

async function ambientWander(agent: LiveAgent): Promise<void> {
  const target: HubName = agent.hub === 'town_square' ? ROLE_HUBS[agent.role] : 'town_square';
  await moveAgent(agent, target);
  setAgentStatus(agent, 'idle', null);
  const lines = AMBIENT_LINES[agent.role];
  const line = lines[Math.floor(Math.random() * lines.length)];
  broadcastFrame('agent_speak', { agentId: agent.username, agentName: agent.name, text: line, type: 'saying', taskId: null });
  await store.createMessage(agent.storeId, 'saying', line, null);
}

function ambientTick(): void {
  const now = Date.now();
  for (const agent of agents.values()) {
    if (now < agent.nextAmbientAt) continue;
    agent.nextAmbientAt = now + randomBetween(20_000, 40_000);
    if (agent.busy || agent.status !== 'idle') continue;
    if (Math.random() > 0.3) continue;

    // Held busy for the whole wander so acquireAgent can't hand this agent to a task
    // mid-walk (the same hole releaseAgent had).
    agent.busy = true;
    ambientWander(agent)
      .catch((error) => console.error('[orchestrator] ambient wander failed:', error))
      .finally(() => {
        agent.busy = false;
      });
  }
}

async function maybeStartDemoTask(): Promise<void> {
  if (!config.demoMode) return;
  const queued = await store.getTasks('queued');
  if (queued.length > 0 || runningTasks.size > 0) return;
  const template = randomDemoTask();
  await createTask({ title: template.title, description: template.description, priority: 5, sessionId: 'demo', byok: null });
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: number;
  sessionId: string;
  byok: ByokCredentials | null;
}

export async function createTask(input: CreateTaskInput): Promise<WireTask> {
  const resolved = resolveProvider(input.byok);
  let row = await store.createTask(input.title, input.description || null, input.priority, input.sessionId);
  row =
    (await store.setTaskFields(row.id, {
      status: 'queued',
      engine: resolved ? 'llm' : 'simulation',
      provider: resolved ? resolved.provider : null,
    })) || row;

  if (resolved) taskProviders.set(row.id, resolved);

  const wire = await toWireTask(row, input.sessionId);
  broadcastFrame('task_created', { task: wire });
  pump();
  return wire;
}

export async function queueLength(): Promise<number> {
  return (await store.getTasks('queued')).length;
}

export async function listTasksWire(sessionId: string | null): Promise<WireTask[]> {
  const rows = await store.listTasksNewestFirst();
  return Promise.all(rows.map((r) => toWireTask(r, sessionId)));
}

export async function getTaskWire(id: number, sessionId: string | null = null): Promise<WireTask | null> {
  const row = await store.getTask(id);
  return row ? toWireTask(row, sessionId) : null;
}

export async function recentMessages(limit: number): Promise<WireMessage[]> {
  const rows = await store.getRecentMessages(limit);
  return Promise.all(rows.map(toWireMessage));
}

export async function listAgentsWire(): Promise<WireAgent[]> {
  return Promise.all([...agents.values()].map(toWireAgent));
}

export async function getAgentWire(username: string): Promise<WireAgent | null> {
  const agent = agents.get(username);
  return agent ? toWireAgent(agent) : null;
}

export async function updateAgentProfile(
  username: string,
  fields: { name?: string; personality?: string; capabilities?: string[] }
): Promise<WireAgent | null> {
  const agent = agents.get(username);
  if (!agent) return null;

  const updated = await store.updateAgent(agent.storeId, {
    name: fields.name,
    personality: fields.personality,
    capabilities: fields.capabilities ? fields.capabilities.join(',') : undefined,
  });
  if (!updated) return null;

  if (fields.name) agent.name = fields.name;
  return toWireAgent(agent);
}

export function getSnapshot(): StateSnapshot {
  return lastSnapshot;
}

export async function healthInfo(): Promise<{
  engine: 'llm' | 'simulation' | 'eliza';
  provider: WireTask['provider'];
  model: string | null;
  byok: boolean;
  storage: 'memory' | 'postgres';
  agents: number;
  queue: number;
}> {
  const resolved = config.engine === 'eliza' ? null : resolveProvider(null);
  return {
    engine: config.engine === 'eliza' ? 'eliza' : resolved ? 'llm' : 'simulation',
    provider: resolved?.provider ?? null,
    model: resolved?.model ?? null,
    byok: config.allowByok,
    storage: store.storageKind,
    agents: agents.size,
    queue: await queueLength(),
  };
}

export async function init(): Promise<void> {
  await store.initStore();

  const rows = await store.getAgents();
  for (const character of ELIZA_TOWN_CHARACTERS) {
    const row = rows.find((r) => r.username === character.username);
    if (!row) continue;
    usernameByStoreId.set(row.id, character.username);
    agents.set(character.username, {
      username: character.username,
      name: character.name,
      role: character.role,
      modelId: character.modelId,
      storeId: row.id,
      hub: ROLE_HUBS[character.role],
      status: 'idle',
      doing: null,
      busy: false,
      nextAmbientAt: Date.now() + randomBetween(20_000, 40_000),
    });
  }

  ws.setStateSnapshotProvider(() => lastSnapshot as unknown as Record<string, unknown>);
  await refreshAndBroadcastState();

  stateTimer = setInterval(() => {
    refreshAndBroadcastState().catch((error) => console.error('[orchestrator] state broadcast failed:', error));
  }, 5000);
  ambientTimer = setInterval(ambientTick, 5000);
  if (config.demoMode) {
    demoTimer = setInterval(() => {
      maybeStartDemoTask().catch((error) => console.error('[orchestrator] demo task failed:', error));
    }, config.demoTaskIntervalMs);
  }

  pump();
}

export function shutdown(): void {
  if (stateTimer) clearInterval(stateTimer);
  if (ambientTimer) clearInterval(ambientTimer);
  if (demoTimer) clearInterval(demoTimer);
}
