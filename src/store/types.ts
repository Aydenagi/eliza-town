export type AgentRole = 'planner' | 'designer' | 'coder' | 'reviewer';

export interface Agent {
  id: number;
  username: string;
  name: string;
  type: AgentRole;
  model_id: string;
  personality: string;
  capabilities: string;
  status: string;
  current_hub_id: number | null;
  position_x: number | null;
  position_z: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentUpdateFields {
  name?: string;
  type?: string;
  model_id?: string;
  personality?: string;
  capabilities?: string;
}

export interface Hub {
  id: number;
  name: string;
  type: string;
  position_x: number;
  position_z: number;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assigned_agent_id: number | null;
  session_id: string | null;
  engine: string | null;
  provider: string | null;
  error: string | null;
  result_summary: string | null;
  preview_url: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface TaskFieldUpdate {
  status?: string;
  engine?: string;
  provider?: string | null;
  error?: string | null;
  result_summary?: string | null;
  preview_url?: string | null;
  completed_at?: Date;
}

export interface Subtask {
  id: number;
  task_id: number;
  role: string | null;
  title: string;
  description: string | null;
  status: string;
  agent_username: string | null;
  order_index: number;
  output: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface Message {
  id: number;
  agent_id: number;
  agent_name?: string;
  agent_type?: string;
  type: string;
  content: string;
  task_id: number | null;
  subtask_id: number | null;
  target_agent_id: number | null;
  hub_id: number | null;
  created_at: Date;
}

export interface ApiCall {
  id: number;
  agent_id: number;
  task_id: number | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  prompt_summary: string;
  response_summary: string;
  duration_ms: number;
  created_at: Date;
}

export interface TaskFileRecord {
  name: string;
  size: number;
}

export interface Store {
  kind: 'memory' | 'postgres';
  getAgents(): Promise<Agent[]>;
  getAgent(id: number): Promise<Agent | undefined>;
  getAgentByUsername(username: string): Promise<Agent | undefined>;
  updateAgentStatus(
    id: number,
    status: string,
    hubId?: number | null,
    positionX?: number | null,
    positionZ?: number | null
  ): Promise<Agent | undefined>;
  createAgent(
    username: string,
    name: string,
    type: string,
    modelId: string,
    personality: string,
    capabilities: string
  ): Promise<Agent>;
  updateAgent(id: number, updates: AgentUpdateFields): Promise<Agent | undefined>;
  getHubs(): Promise<Hub[]>;
  getHub(id: number): Promise<Hub | undefined>;
  getHubByName(name: string): Promise<Hub | undefined>;
  getTasks(status?: string | null, sessionId?: string | null): Promise<Task[]>;
  listTasksNewestFirst(sessionId?: string | null): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(
    title: string,
    description: string | null,
    priority?: number,
    sessionId?: string | null
  ): Promise<Task>;
  updateTaskStatus(id: number, status: string, assignedAgentId?: number | null): Promise<Task | undefined>;
  setTaskFields(id: number, fields: TaskFieldUpdate): Promise<Task | undefined>;
  getSubtasks(taskId: number): Promise<Subtask[]>;
  createSubtask(
    taskId: number,
    title: string,
    description: string | null,
    orderIndex: number,
    role?: string | null
  ): Promise<Subtask>;
  updateSubtaskStatus(id: number, status: string, output?: string | null): Promise<Subtask | undefined>;
  assignSubtaskAgent(id: number, agentUsername: string): Promise<Subtask | undefined>;
  createMessage(
    agentId: number,
    type: string,
    content: string,
    taskId?: number | null,
    subtaskId?: number | null,
    targetAgentId?: number | null,
    hubId?: number | null
  ): Promise<Message>;
  getRecentMessages(limit?: number): Promise<Message[]>;
  logApiCall(
    agentId: number,
    taskId: number | null,
    model: string,
    inputTokens: number,
    outputTokens: number,
    promptSummary: string,
    responseSummary: string,
    durationMs: number
  ): Promise<ApiCall>;
  addTaskFile(taskId: number, file: TaskFileRecord): Promise<void>;
}
