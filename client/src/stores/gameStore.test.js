import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore'
import { bfsPath } from '../worlds/graph'

const SAMPLE_GRAPH = {
  nodes: {
    a: { x: 0, y: 0, z: 0 },
    b: { x: 1, y: 0, z: 0 },
    c: { x: 2, y: 0, z: 0 },
    d: { x: 2, y: 0, z: 1 },
    isolated: { x: 10, y: 0, z: 10 },
  },
  edges: [['a', 'b'], ['b', 'c'], ['c', 'd']],
}

function resetStore() {
  useGameStore.setState({
    connected: false,
    health: null,
    agents: {},
    movements: {},
    tasks: [],
    messages: [],
    selectedAgentId: null,
  })
}

beforeEach(resetStore)

describe('bfsPath', () => {
  it('finds the shortest chain of nodes', () => {
    expect(bfsPath(SAMPLE_GRAPH, 'a', 'd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns a single-node path from a node to itself', () => {
    expect(bfsPath(SAMPLE_GRAPH, 'a', 'a')).toEqual(['a'])
  })

  it('returns null when there is no route', () => {
    expect(bfsPath(SAMPLE_GRAPH, 'a', 'isolated')).toBeNull()
  })

  it('returns null for an unknown node', () => {
    expect(bfsPath(SAMPLE_GRAPH, 'a', 'nowhere')).toBeNull()
  })
})

describe('task upsert ordering', () => {
  it('unshifts a new task to the front', () => {
    const { upsertTask } = useGameStore.getState()
    upsertTask({ id: 1, title: 'first' })
    upsertTask({ id: 2, title: 'second' })
    expect(useGameStore.getState().tasks.map((t) => t.id)).toEqual([2, 1])
  })

  it('replaces an existing task in place instead of reordering', () => {
    const { upsertTask } = useGameStore.getState()
    upsertTask({ id: 1, title: 'first', status: 'queued' })
    upsertTask({ id: 2, title: 'second', status: 'queued' })
    upsertTask({ id: 1, title: 'first', status: 'completed' })
    const tasks = useGameStore.getState().tasks
    expect(tasks.map((t) => t.id)).toEqual([2, 1])
    expect(tasks.find((t) => t.id === 1).status).toBe('completed')
  })
})

describe('state_update merge', () => {
  it('keeps an in-flight movement target untouched', () => {
    const { setAgents, startMove, mergeStateUpdate } = useGameStore.getState()
    setAgents([{ id: 'eliza-planner', current_hub: 'town_square', status: 'idle' }])
    startMove('eliza-planner', { from: 'town_square', to: 'planning_room', travelMs: 3000 })

    const before = useGameStore.getState().movements['eliza-planner']

    mergeStateUpdate({
      agents: [{ id: 'eliza-planner', current_hub: 'town_square', status: 'traveling' }],
      tasks: [],
      messages: [],
    })

    const after = useGameStore.getState().movements['eliza-planner']
    expect(after).toEqual(before)
  })

  it('updates agent snapshot fields without clearing movements for other agents', () => {
    const { setAgents, startMove, mergeStateUpdate } = useGameStore.getState()
    setAgents([{ id: 'ada-coder', current_hub: 'coding_desk', status: 'idle', doing: null }])
    startMove('ada-coder', { from: 'coding_desk', to: 'town_square', travelMs: 1500 })

    mergeStateUpdate({
      agents: [{ id: 'ada-coder', current_hub: 'coding_desk', status: 'traveling', doing: 'walking' }],
      tasks: [],
      messages: [],
    })

    const state = useGameStore.getState()
    expect(state.agents['ada-coder'].doing).toBe('walking')
    expect(state.movements['ada-coder']).toBeTruthy()
  })
})

describe('messages cap', () => {
  it('keeps at most 100 messages, newest first', () => {
    const { addMessage } = useGameStore.getState()
    for (let i = 0; i < 120; i++) {
      addMessage({ id: i, agentId: 'eliza-planner', agentName: 'Eliza', type: 'saying', content: `msg ${i}`, taskId: null, createdAt: new Date().toISOString() })
    }
    const messages = useGameStore.getState().messages
    expect(messages.length).toBe(100)
    expect(messages[0].id).toBe(119)
  })
})
