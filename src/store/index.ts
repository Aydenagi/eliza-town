import { config } from '../config.js';
import { createMemoryStore } from './memory.js';
import { createPgStore } from './pg.js';
import type { Store } from './types.js';

export * from './types.js';

const impl: Store = config.databaseUrl ? createPgStore(config.databaseUrl) : createMemoryStore();

export async function initStore(): Promise<void> {
  if ('init' in impl) {
    await (impl as Store & { init(): Promise<void> }).init();
  }
}

export const storageKind: 'memory' | 'postgres' = impl.kind;

export const getAgents = impl.getAgents;
export const getAgent = impl.getAgent;
export const getAgentByUsername = impl.getAgentByUsername;
export const updateAgentStatus = impl.updateAgentStatus;
export const createAgent = impl.createAgent;
export const updateAgent = impl.updateAgent;
export const getHubs = impl.getHubs;
export const getHub = impl.getHub;
export const getHubByName = impl.getHubByName;
export const getTasks = impl.getTasks;
export const listTasksNewestFirst = impl.listTasksNewestFirst;
export const getTask = impl.getTask;
export const createTask = impl.createTask;
export const updateTaskStatus = impl.updateTaskStatus;
export const setTaskFields = impl.setTaskFields;
export const getSubtasks = impl.getSubtasks;
export const createSubtask = impl.createSubtask;
export const updateSubtaskStatus = impl.updateSubtaskStatus;
export const assignSubtaskAgent = impl.assignSubtaskAgent;
export const createMessage = impl.createMessage;
export const getRecentMessages = impl.getRecentMessages;
export const logApiCall = impl.logApiCall;
export const addTaskFile = impl.addTaskFile;
