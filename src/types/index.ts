/**
 * Legacy type definitions used by src/eliza/* (the opt-in ENGINE=eliza path).
 *
 * Row shapes (Agent, Hub, Task, Subtask, Message, ApiCall) are owned by
 * src/store/ now and re-exported here under their old names because
 * src/eliza/* was written against the old src/db/index.ts module.
 */

export type { Agent, Hub, Task, Subtask, Message, ApiCall } from '../store/index.js';

export type AgentRole = 'planner' | 'designer' | 'coder' | 'reviewer';
export type AgentStatus = 'idle' | 'working' | 'traveling' | 'chatting' | string;

export interface SavedFile {
  name: string;
  path: string;
  size: number;
  created?: Date;
}

export interface OrchestrationOptions {
  db: typeof import('../store/index.js');
  broadcast: BroadcastFn;
  storage?: typeof import('../storage/index.js');
}

export interface ActiveWork {
  taskId: number;
  subtaskId: number;
  startedAt: number;
}

export interface TravelingAgent {
  targetHub: string;
  arrivalTime: number;
}

export interface AgentState {
  dbId?: number;
  name?: string;
  role?: AgentRole;
  status: AgentStatus;
  hub: string;
  x: number;
  z: number;
  doing?: string | null;
  targetHub?: string;
  travelStarted?: number;
  travelTime?: number;
  modelId?: string;
  updatedAt?: number;
}

export interface AgentMetadata {
  dbId: number | null;
  name: string;
  role: AgentRole;
  modelId: string;
}

export interface OrchestrationState {
  isRunning: boolean;
  agents: Array<AgentState & AgentMetadata & { agentId: string }>;
  activeWork: Array<[string, ActiveWork]>;
  travelingAgents: Array<[string, TravelingAgent]>;
}

export interface RuntimeBundle {
  runtime: ElizaRuntime;
  narratorId: string;
  roomId: string;
  worldId: string;
}

export interface TriggerResult {
  didRespond: boolean;
  text: string;
  thought: string;
  actions: string[];
  agentId: string;
  agentName: string;
}

// Simplified type definitions for ElizaOS. The actual types come from @elizaos/core.
export interface ElizaRuntime {
  character?: {
    name?: string;
    username?: string;
    role?: string;
  };
  agentId: string;
  messageService?: {
    handleMessage: (
      runtime: ElizaRuntime,
      message: ElizaMessage,
      callback: (content: ElizaContent) => Promise<unknown[]>
    ) => Promise<ElizaHandleResult>;
  };
  setSetting: (key: string, value: string | boolean, isSecret?: boolean) => void;
  initialize: () => Promise<void>;
  stop: () => Promise<void>;
  ensureConnection: (config: ConnectionConfig) => Promise<void>;
  createMemory: (memory: ElizaMessage, tableName: string) => Promise<void>;
}

export interface ElizaMessage {
  id: string;
  entityId: string;
  roomId: string;
  embedding?: number[];
  content: {
    text: string;
    source?: string;
    channelType?: string;
  };
}

export interface ElizaContent {
  text?: string;
  thought?: string;
  actions?: string[];
  actionCallbacks?: {
    text?: string;
  };
}

export interface ElizaHandleResult {
  didRespond: boolean;
  responseContent?: ElizaContent;
}

export interface ConnectionConfig {
  entityId: string;
  roomId: string;
  worldId: string;
  userName: string;
  source: string;
  channelId: string;
  type: string;
}

export interface WSMessage {
  type: string;
  data?: Record<string, unknown>;
  timestamp?: number;
}

export type BroadcastFn = (message: WSMessage) => void;
