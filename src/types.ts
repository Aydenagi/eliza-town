/**
 * Wire-facing types. These match docs/PROTOCOL.md exactly and are shared
 * between REST responses, WebSocket frames, and the direct engine.
 */

export type AgentRole = 'planner' | 'designer' | 'coder' | 'reviewer';
export type AgentStatus = 'idle' | 'traveling' | 'working' | 'talking';
export type HubName =
  | 'town_square'
  | 'planning_room'
  | 'design_studio'
  | 'coding_desk'
  | 'review_station'
  | 'deploy_station';

export interface Agent {
  id: string;
  name: string;
  type: AgentRole;
  status: AgentStatus;
  current_hub: HubName;
  doing: string | null;
  model_id: string;
  personality: string;
  capabilities: string[];
}

export type TaskStatus =
  | 'queued'
  | 'planning'
  | 'designing'
  | 'coding'
  | 'reviewing'
  | 'completed'
  | 'failed';

export type SubtaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface Subtask {
  id: number;
  role: AgentRole;
  title: string;
  description: string;
  status: SubtaskStatus;
  agentId: string | null;
  output: string | null;
}

export interface TaskFile {
  name: string;
  size: number;
}

export type EngineName = 'llm' | 'simulation';
export type LLMProviderName = 'anthropic' | 'openai' | 'groq';

export interface TaskResult {
  summary: string;
  previewUrl: string | null;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  sessionId: string | null;
  mine?: boolean;
  engine: EngineName;
  provider: LLMProviderName | null;
  queuePosition: number | null;
  subtasks: Subtask[];
  files: TaskFile[];
  result: TaskResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type MessageType = 'saying' | 'thought' | 'status' | 'code' | 'system';

export interface Message {
  id: number;
  agentId: string;
  agentName: string;
  type: MessageType;
  content: string;
  taskId: number | null;
  createdAt: string;
}

export interface HealthResponse {
  status: 'ok';
  engine: 'llm' | 'simulation' | 'eliza';
  provider: LLMProviderName | null;
  model: string | null;
  byok: boolean;
  storage: 'memory' | 'postgres';
  agents: number;
  queue: number;
  timestamp: number;
}

export interface StateSnapshot {
  agents: Agent[];
  tasks: Task[];
  messages: Message[];
}

export interface WSFrame {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}
