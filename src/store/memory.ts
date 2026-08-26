import { ELIZA_TOWN_CHARACTERS, HUBS } from '../characters.js';
import type {
  Agent,
  AgentUpdateFields,
  ApiCall,
  Hub,
  Message,
  Store,
  Subtask,
  Task,
  TaskFieldUpdate,
  TaskFileRecord,
} from './types.js';

function nextId(counter: { value: number }): number {
  counter.value += 1;
  return counter.value;
}

export function createMemoryStore(): Store {
  const agentIds = { value: 0 };
  const taskIds = { value: 0 };
  const subtaskIds = { value: 0 };
  const messageIds = { value: 0 };
  const apiCallIds = { value: 0 };
  const hubIds = { value: 0 };

  const agents = new Map<number, Agent>();
  const hubs = new Map<number, Hub>();
  const tasks = new Map<number, Task>();
  const subtasks = new Map<number, Subtask>();
  const messages: Message[] = [];
  const apiCalls: ApiCall[] = [];
  const taskFiles = new Map<number, TaskFileRecord[]>();

  for (const [name, hub] of Object.entries(HUBS)) {
    const id = nextId(hubIds);
    hubs.set(id, { id, name, type: name, position_x: hub.x, position_z: hub.z });
  }

  for (const character of ELIZA_TOWN_CHARACTERS) {
    const id = nextId(agentIds);
    const now = new Date();
    agents.set(id, {
      id,
      username: character.username,
      name: character.name,
      type: character.role,
      model_id: character.modelId,
      personality: character.adjectives.join(', '),
      capabilities: character.capabilities.join(','),
      status: 'idle',
      current_hub_id: null,
      position_x: null,
      position_z: null,
      created_at: now,
      updated_at: now,
    });
  }

  async function getAgents(): Promise<Agent[]> {
    return [...agents.values()].sort((a, b) => a.id - b.id);
  }

  async function getAgent(id: number): Promise<Agent | undefined> {
    return agents.get(id);
  }

  async function getAgentByUsername(username: string): Promise<Agent | undefined> {
    return [...agents.values()].find((a) => a.username === username);
  }

  async function updateAgentStatus(
    id: number,
    status: string,
    hubId: number | null = null,
    positionX: number | null = null,
    positionZ: number | null = null
  ): Promise<Agent | undefined> {
    const agent = agents.get(id);
    if (!agent) return undefined;
    agent.status = status;
    if (hubId !== null) agent.current_hub_id = hubId;
    if (positionX !== null) agent.position_x = positionX;
    if (positionZ !== null) agent.position_z = positionZ;
    agent.updated_at = new Date();
    return agent;
  }

  async function createAgent(
    username: string,
    name: string,
    type: string,
    modelId: string,
    personality: string,
    capabilities: string
  ): Promise<Agent> {
    const id = nextId(agentIds);
    const now = new Date();
    const agent: Agent = {
      id,
      username,
      name,
      type: type as Agent['type'],
      model_id: modelId,
      personality,
      capabilities,
      status: 'idle',
      current_hub_id: null,
      position_x: null,
      position_z: null,
      created_at: now,
      updated_at: now,
    };
    agents.set(id, agent);
    return agent;
  }

  async function updateAgent(id: number, updates: AgentUpdateFields): Promise<Agent | undefined> {
    const agent = agents.get(id);
    if (!agent) return undefined;
    if (updates.name !== undefined) agent.name = updates.name;
    if (updates.type !== undefined) agent.type = updates.type as Agent['type'];
    if (updates.model_id !== undefined) agent.model_id = updates.model_id;
    if (updates.personality !== undefined) agent.personality = updates.personality;
    if (updates.capabilities !== undefined) agent.capabilities = updates.capabilities;
    agent.updated_at = new Date();
    return agent;
  }

  async function getHubs(): Promise<Hub[]> {
    return [...hubs.values()];
  }

  async function getHub(id: number): Promise<Hub | undefined> {
    return hubs.get(id);
  }

  async function getHubByName(name: string): Promise<Hub | undefined> {
    return [...hubs.values()].find((h) => h.name === name);
  }

  function matchesFilters(task: Task, status?: string | null, sessionId?: string | null): boolean {
    if (status && task.status !== status) return false;
    if (sessionId && task.session_id !== sessionId) return false;
    return true;
  }

  async function getTasks(status: string | null = null, sessionId: string | null = null): Promise<Task[]> {
    return [...tasks.values()]
      .filter((t) => matchesFilters(t, status, sessionId))
      .sort((a, b) => a.priority - b.priority || a.created_at.getTime() - b.created_at.getTime());
  }

  async function listTasksNewestFirst(sessionId: string | null = null): Promise<Task[]> {
    return [...tasks.values()]
      .filter((t) => matchesFilters(t, null, sessionId))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  async function getTask(id: number): Promise<Task | undefined> {
    return tasks.get(id);
  }

  async function createTask(
    title: string,
    description: string | null,
    priority = 5,
    sessionId: string | null = null
  ): Promise<Task> {
    const id = nextId(taskIds);
    const now = new Date();
    const task: Task = {
      id,
      title,
      description,
      status: 'pending',
      priority,
      assigned_agent_id: null,
      session_id: sessionId,
      engine: null,
      provider: null,
      error: null,
      result_summary: null,
      preview_url: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    tasks.set(id, task);
    return task;
  }

  async function updateTaskStatus(
    id: number,
    status: string,
    assignedAgentId: number | null = null
  ): Promise<Task | undefined> {
    const task = tasks.get(id);
    if (!task) return undefined;
    task.status = status;
    if (assignedAgentId !== null) task.assigned_agent_id = assignedAgentId;
    if (status === 'completed') task.completed_at = new Date();
    task.updated_at = new Date();
    return task;
  }

  async function setTaskFields(id: number, fields: TaskFieldUpdate): Promise<Task | undefined> {
    const task = tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, fields);
    task.updated_at = new Date();
    return task;
  }

  async function getSubtasks(taskId: number): Promise<Subtask[]> {
    return [...subtasks.values()]
      .filter((s) => s.task_id === taskId)
      .sort((a, b) => a.order_index - b.order_index);
  }

  async function createSubtask(
    taskId: number,
    title: string,
    description: string | null,
    orderIndex: number,
    role: string | null = null
  ): Promise<Subtask> {
    const id = nextId(subtaskIds);
    const now = new Date();
    const subtask: Subtask = {
      id,
      task_id: taskId,
      role,
      title,
      description,
      status: 'pending',
      agent_username: null,
      order_index: orderIndex,
      output: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    subtasks.set(id, subtask);
    return subtask;
  }

  async function updateSubtaskStatus(
    id: number,
    status: string,
    output: string | null = null
  ): Promise<Subtask | undefined> {
    const subtask = subtasks.get(id);
    if (!subtask) return undefined;
    subtask.status = status;
    if (output !== null) subtask.output = output;
    if (status === 'completed') subtask.completed_at = new Date();
    subtask.updated_at = new Date();
    return subtask;
  }

  async function assignSubtaskAgent(id: number, agentUsername: string): Promise<Subtask | undefined> {
    const subtask = subtasks.get(id);
    if (!subtask) return undefined;
    subtask.agent_username = agentUsername;
    return subtask;
  }

  async function createMessage(
    agentId: number,
    type: string,
    content: string,
    taskId: number | null = null,
    subtaskId: number | null = null,
    targetAgentId: number | null = null,
    hubId: number | null = null
  ): Promise<Message> {
    const id = nextId(messageIds);
    const agent = agents.get(agentId);
    const message: Message = {
      id,
      agent_id: agentId,
      agent_name: agent?.name,
      agent_type: agent?.type,
      type,
      content,
      task_id: taskId,
      subtask_id: subtaskId,
      target_agent_id: targetAgentId,
      hub_id: hubId,
      created_at: new Date(),
    };
    messages.push(message);
    return message;
  }

  async function getRecentMessages(limit = 50): Promise<Message[]> {
    return messages.slice(-limit).reverse();
  }

  async function logApiCall(
    agentId: number,
    taskId: number | null,
    model: string,
    inputTokens: number,
    outputTokens: number,
    promptSummary: string,
    responseSummary: string,
    durationMs: number
  ): Promise<ApiCall> {
    const id = nextId(apiCallIds);
    const call: ApiCall = {
      id,
      agent_id: agentId,
      task_id: taskId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      prompt_summary: promptSummary,
      response_summary: responseSummary,
      duration_ms: durationMs,
      created_at: new Date(),
    };
    apiCalls.push(call);
    return call;
  }

  async function addTaskFile(taskId: number, file: TaskFileRecord): Promise<void> {
    const existing = taskFiles.get(taskId) || [];
    existing.push(file);
    taskFiles.set(taskId, existing);
  }

  return {
    kind: 'memory',
    getAgents,
    getAgent,
    getAgentByUsername,
    updateAgentStatus,
    createAgent,
    updateAgent,
    getHubs,
    getHub,
    getHubByName,
    getTasks,
    listTasksNewestFirst,
    getTask,
    createTask,
    updateTaskStatus,
    setTaskFields,
    getSubtasks,
    createSubtask,
    updateSubtaskStatus,
    assignSubtaskAgent,
    createMessage,
    getRecentMessages,
    logApiCall,
    addTaskFile,
  };
}
