// Shared world-building helpers: grass fill, road carving tied to the
// walk graph, and prop placement. Kept here because all four worlds need
// the same tile-map + graph construction; each world file only supplies
// its own hub layout, decoration, and prop list.

import { hexToWorld, hexKey, hexLine, hexFill, roadRotation } from './hex'

// A flat-fill disc of tiles keyed "q,r" so later carving (roads, water
// rings) can replace a cell instead of stacking a second tile on it.
export function buildTileMap(radius, baseType, y = 0) {
  const map = new Map()
  for (const cell of hexFill(radius)) {
    map.set(hexKey(cell.q, cell.r), { type: baseType, q: cell.q, r: cell.r, y, rotation: 0 })
  }
  return map
}

// Carves straight hex-line roads between named hub cells and returns the
// graph nodes/edges those roads imply. Hub cells are addressed by name so
// the caller's hub table and the graph agree by construction.
export function carveRoads(tileMap, S, hubCells, connections, options = {}) {
  const { roadType = 'hex_road_A', y = 0 } = options
  const nodes = {}
  const edges = []

  for (const [hubA, hubB] of connections) {
    const a = hubCells[hubA]
    const b = hubCells[hubB]
    const line = hexLine(a, b)
    let prevName = hubA
    line.forEach((cell, i) => {
      const key = hexKey(cell.q, cell.r)
      const existing = tileMap.get(key)
      const prev = line[Math.max(0, i - 1)]
      const next = line[Math.min(line.length - 1, i + 1)]
      const rotation = roadRotation(prev, next, S)
      tileMap.set(key, { ...(existing || { q: cell.q, r: cell.r, y }), type: roadType, rotation })

      if (i === 0 || i === line.length - 1) return
      const name = `${hubA}__${hubB}__${i}`
      nodes[name] = hexToWorld(cell.q, cell.r, S, y)
      edges.push([prevName, name])
      prevName = name
    })
    edges.push([prevName, hubB])
  }

  return { nodes, edges }
}

export function tileMapToArray(tileMap) {
  return Array.from(tileMap.values())
}

// Deterministic scatter of decoration props over a set of tile cells,
// skipping any cell a predicate rejects (e.g. reserved for a hub or road).
export function scatterProps(cells, rng, { count, category, names, S, scale = [1, 1], skip }) {
  const candidates = cells.filter((c) => !skip || !skip(c))
  const props = []
  const used = new Set()
  let attempts = 0
  while (props.length < count && attempts < candidates.length * 4) {
    attempts++
    const cell = candidates[Math.floor(rng() * candidates.length)]
    const key = hexKey(cell.q, cell.r)
    if (used.has(key)) continue
    used.add(key)
    const pos = hexToWorld(cell.q, cell.r, S)
    const name = names[Math.floor(rng() * names.length)]
    const s = scale[0] + rng() * (scale[1] - scale[0])
    props.push({
      category,
      name,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rotation: rng() * Math.PI * 2,
      scale: S * s,
    })
  }
  return props
}
