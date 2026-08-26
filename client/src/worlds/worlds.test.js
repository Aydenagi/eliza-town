import { describe, it, expect } from 'vitest'
import { WORLDS } from './index'
import { bfsPath } from './graph'
import * as structures from '../scene/build/structures'

const HUB_NAMES = ['town_square', 'planning_room', 'design_studio', 'coding_desk', 'review_station', 'deploy_station']

function reachableFrom(graph, start) {
  const adjacency = new Map()
  for (const [a, b] of graph.edges) {
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a).push(b)
    adjacency.get(b).push(a)
  }
  const visited = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const node = queue.shift()
    for (const neighbor of adjacency.get(node) || []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }
  return visited
}

describe.each(Object.entries(WORLDS))('world: %s', (id, world) => {
  it('has all six hubs', () => {
    for (const name of HUB_NAMES) {
      expect(world.hubs[name]).toBeTruthy()
    }
  })

  it('has every hub as a graph node', () => {
    for (const name of HUB_NAMES) {
      expect(world.graph.nodes[name]).toBeTruthy()
    }
  })

  it('BFS finds a path between every ordered hub pair', () => {
    for (const from of HUB_NAMES) {
      for (const to of HUB_NAMES) {
        if (from === to) continue
        const path = bfsPath(world.graph, from, to)
        expect(path, `${id}: ${from} -> ${to}`).not.toBeNull()
      }
    }
  })

  it('every graph edge references an existing node', () => {
    for (const [a, b] of world.graph.edges) {
      expect(world.graph.nodes[a], `${id}: missing node ${a}`).toBeTruthy()
      expect(world.graph.nodes[b], `${id}: missing node ${b}`).toBeTruthy()
    }
  })

  it('the graph is fully connected', () => {
    const nodeNames = Object.keys(world.graph.nodes)
    const reached = reachableFrom(world.graph, nodeNames[0])
    for (const name of nodeNames) {
      expect(reached.has(name), `${id}: ${name} unreachable`).toBe(true)
    }
  })

  it('every structure kind exists in structures.js', () => {
    for (const s of world.structures) {
      expect(typeof structures[s.kind], `${id}: unknown structure kind ${s.kind}`).toBe('function')
    }
  })

  it('has camera and lighting configured', () => {
    expect(world.camera.position).toHaveLength(3)
    expect(world.camera.target).toHaveLength(3)
    expect(world.ambient).toBeTruthy()
    expect(world.hemisphere).toBeTruthy()
    expect(world.sun).toBeTruthy()
  })
})
