import { resolveProvider } from '../llm/index.js';
import * as storage from '../storage/index.js';
import * as store from '../store/index.js';
import type { Task as StoreTask } from '../store/index.js';
import type { WSMessage } from '../types/index.js';
import type {
  Agent as WireAgent,
  AgentRole,
  AgentStatus,
  HubName,
  Message as WireMessage,
  MessageType,
  SubtaskStatus,
  Task as WireTask,
  TaskStatus,
} from '../types.js';
import * as ws from '../websocket/index.js';
import type { CreateTaskInput } from './orchestrator.js';

let orchestrationModule: typeof import('../eliza/orchestration.js') | null = null;

export async function startElizaEngine(): Promise<void> {
  await store.initStore();

  ws.setStateSnapshotProvider(() => ({ agents: [], tasks: [], messages: [] }));

  const broadcast = (message: WSMessage): void => {
    ws.broadcast(message.type, message.data ?? {});
  };

  orchestrationModule = await import('../eliza/orchestration.js');
  await orchestrationModule.initialize({ db: store, broadcast, storage });
  orchestrationModule.start(5000);
}

export function stopElizaEngine(): void {
  orchestrationModule?.stop();
}

function mapAgentStatus(status: string): AgentStatus {
  if (status === 'chatting') return 'talking';
  if (status === 'idle' || status === 'traveling' || status === 'working' || status === 'talking') return status;
  return 'idle';
}

export async function listAgentsEliza(): Promise<WireAgent[]> {
  if (!orchestrationModule) return [];
  const state = orchestrationModule.getState();
  return Promise.all(
    state.agents.map(async (a) => {
      const row = await store.getAgentByUsername(a.agentId);
      const capabilities = (row?.capabilities || '').split(',').map((c) => c.trim()).filter(Boolean);
      return {
        id: a.agentId,
        name: a.name,
        type: a.role as AgentRole,
        status: mapAgentStatus(a.status),
        current_hub: (a.hub as HubName) || 'town_square',
        doing: null,
        model_id: a.modelId,
        personality: row?.personality || '',
        capabilities,
      };
    })
  );
}

export async function getAgentEliza(username: string): Promise<WireAgent | null> {
  const list = await listAgentsEliza();
  return list.find((a) => a.id === username) || null;
}

export async function updateAgentEliza(
  username: string,
  fields: { name?: string; personality?: string; capabilities?: string[] }
): Promise<WireAgent | null> {
  const row = await store.getAgentByUsername(username);
  if (!row) return null;
  await store.updateAgent(row.id, {
    name: fields.name,
    personality: fields.personality,
    capabilities: fields.capabilities ? fields.capabilities.join(',') : undefined,
  });
  return getAgentEliza(username);
}

function mapTaskStatus(status: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    pending: 'queued',
    in_progress: 'coding',
    review: 'reviewing',
    completed: 'completed',
    cancelled: 'failed',
    failed: 'failed',
  };
  return map[status] || 'queued';
}

function mapSubtaskStatus(status: string): SubtaskStatus {
  if (status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'skipped') return status;
  if (status === 'cancelled') return 'skipped';
  return 'pending';
}

async function toWireTaskEliza(row: StoreTask, sessionId: string | null): Promise<WireTask> {
  const subtaskRows = await store.getSubtasks(row.id);
  const files = await storage.listTaskFiles(row.id);
  const resolved = resolveProvider(null);

  let queuePosition: number | null = null;
  if (row.status === 'pending') {
    const pending = await store.getTasks('pending');
    const idx = pending.findIndex((t) => t.id === row.id);
    queuePosition = idx === -1 ? null : idx + 1;
  }

  const assignedAgent = row.assigned_agent_id ? await store.getAgent(row.assigned_agent_id) : undefined;

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: mapTaskStatus(row.status),
    priority: row.priority,
    sessionId: row.session_id,
    mine: sessionId ? row.session_id === sessionId : undefined,
    engine: 'llm',
    provider: resolved?.provider ?? null,
    queuePosition,
    subtasks: subtaskRows.map((s) => ({
      id: s.id,
      role: (s.role as AgentRole) || 'coder',
      title: s.title,
      description: s.description || '',
      status: mapSubtaskStatus(s.status),
      agentId: s.agent_username || assignedAgent?.username || null,
      output: s.output,
    })),
    files,
    result:
      row.status === 'completed'
        ? { summary: row.title, previewUrl: files.some((f) => f.name === 'index.html') ? `/api/tasks/${row.id}/preview/` : null }
        : null,
    error: null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

export async function listTasksEliza(sessionId: string | null): Promise<WireTask[]> {
  const rows = await store.listTasksNewestFirst();
  return Promise.all(rows.map((r) => toWireTaskEliza(r, sessionId)));
}

export async function getTaskEliza(id: number, sessionId: string | null): Promise<WireTask | null> {
  const row = await store.getTask(id);
  return row ? toWireTaskEliza(row, sessionId) : null;
}

export async function createTaskEliza(input: CreateTaskInput): Promise<WireTask> {
  if (!orchestrationModule) throw new Error('Eliza engine is not running.');
  const row = await orchestrationModule.createTask(input.title, input.description || null, input.priority, input.sessionId);
  return toWireTaskEliza(row, input.sessionId);
}

export async function queueLengthEliza(): Promise<number> {
  return (await store.getTasks('pending')).length;
}

export async function recentMessagesEliza(limit: number): Promise<WireMessage[]> {
  const rows = await store.getRecentMessages(limit);
  return Promise.all(
    rows.map(async (row) => {
      const agent = await store.getAgent(row.agent_id);
      const username = agent?.username || String(row.agent_id);
      return {
        id: row.id,
        agentId: username,
        agentName: row.agent_name || username,
        type: (row.type as MessageType) || 'saying',
        content: row.content,
        taskId: row.task_id,
        createdAt: row.created_at.toISOString(),
      };
    })
  );
}

export async function healthInfoEliza(): Promise<{
  engine: 'eliza';
  provider: 'anthropic' | 'openai' | 'groq' | null;
  model: string | null;
  byok: boolean;
  storage: 'memory' | 'postgres';
  agents: number;
  queue: number;
}> {
  const resolved = resolveProvider(null);
  const [agentRows, pendingTasks] = await Promise.all([store.getAgents(), store.getTasks('pending')]);
  return {
    engine: 'eliza',
    provider: resolved?.provider ?? null,
    model: resolved?.model ?? null,
    byok: false,
    storage: store.storageKind,
    agents: agentRows.length,
    queue: pendingTasks.length,
  };
}
