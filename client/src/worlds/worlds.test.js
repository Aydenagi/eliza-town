import { describe, it, expect } from 'vitest'
import { WORLDS } from './index'
import { bfsPath } from './graph'
import { hexToWorld } from './hex'

const HUB_NAMES = ['town_square', 'planning_room', 'design_studio', 'coding_desk', 'review_station', 'deploy_station']

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

  it('every hub position matches a hex cell center', () => {
    for (const name of HUB_NAMES) {
      const hub = world.hubs[name]
      const match = world.tiles.some((tile) => {
        const pos = hexToWorld(tile.q, tile.r, world.scale, tile.y)
        return Math.abs(pos.x - hub.x) < 0.01 && Math.abs(pos.z - hub.z) < 0.01
      })
      expect(match).toBe(true)
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

  it('has a non-empty tile set', () => {
    expect(world.tiles.length).toBeGreaterThan(0)
  })
})
