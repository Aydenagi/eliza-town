import { create } from 'zustand'

const MAX_MESSAGES = 100

function upsertTask(tasks, task) {
  const index = tasks.findIndex((t) => t.id === task.id)
  if (index === -1) return [task, ...tasks]
  const next = [...tasks]
  next[index] = task
  return next
}

export const useGameStore = create((set, get) => ({
  connected: false,
  health: null,

  agents: {},
  movements: {},

  tasks: [],
  messages: [],

  selectedAgentId: null,

  setConnected: (connected) => set({ connected }),
  setHealth: (health) => set({ health }),

  setAgents: (agentList) => set((state) => {
    const agents = { ...state.agents }
    for (const agent of agentList) {
      agents[agent.id] = agent
    }
    return { agents }
  }),

  patchAgent: (agentId, patch) => set((state) => {
    const existing = state.agents[agentId]
    if (!existing) return state
    return { agents: { ...state.agents, [agentId]: { ...existing, ...patch } } }
  }),

  setTasks: (tasks) => set({ tasks }),

  upsertTask: (task) => set((state) => ({ tasks: upsertTask(state.tasks, task) })),

  addTaskFile: (taskId, file) => set((state) => {
    const index = state.tasks.findIndex((t) => t.id === taskId)
    if (index === -1) return state
    const tasks = [...state.tasks]
    tasks[index] = { ...tasks[index], files: [...tasks[index].files, file] }
    return { tasks }
  }),

  setMessages: (messages) => set({ messages: messages.slice(0, MAX_MESSAGES) }),

  addMessage: (message) => set((state) => ({
    messages: [message, ...state.messages].slice(0, MAX_MESSAGES),
  })),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
  clearSelectedAgent: () => set({ selectedAgentId: null }),

  startMove: (agentId, { from, to, travelMs }) => set((state) => ({
    movements: {
      ...state.movements,
      [agentId]: { fromHub: from, targetHub: to, travelMs, startedAt: Date.now() },
    },
  })),

  clearMove: (agentId) => set((state) => {
    if (!(agentId in state.movements)) return state
    const movements = { ...state.movements }
    delete movements[agentId]
    return { movements }
  }),

  getMovement: (agentId) => get().movements[agentId] || null,

  // Full snapshot from the server. Never touches `movements` -- an
  // in-flight walk is only started/ended by agent_move / agent_arrived,
  // so a stale `traveling` status in the snapshot cannot restart or
  // cancel it.
  mergeStateUpdate: (data) => set((state) => {
    const agents = { ...state.agents }
    for (const agent of data.agents || []) {
      agents[agent.id] = agent
    }
    return {
      agents,
      tasks: data.tasks ?? state.tasks,
      messages: (data.messages ?? state.messages).slice(0, MAX_MESSAGES),
    }
  }),
}))

export const useBubbleStore = create((set) => ({
  bubbles: {},

  showBubble: (agentId, text, type = 'saying', duration = 4000) => set((state) => ({
    bubbles: { ...state.bubbles, [agentId]: { text, type, expiresAt: Date.now() + duration } },
  })),

  clearExpired: () => set((state) => {
    const now = Date.now()
    let changed = false
    const bubbles = { ...state.bubbles }
    for (const [id, bubble] of Object.entries(bubbles)) {
      if (bubble.expiresAt < now) {
        delete bubbles[id]
        changed = true
      }
    }
    return changed ? { bubbles } : state
  }),
}))
