// BFS pathfinding over a world's walk graph. Nodes are named points in
// world space (hubs plus road waypoints); edges are undirected pairs.

function buildAdjacency(edges) {
  const adjacency = new Map()
  for (const [a, b] of edges) {
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a).push(b)
    adjacency.get(b).push(a)
  }
  return adjacency
}

// Returns an array of node names from `from` to `to` inclusive, or null
// when no path exists.
export function bfsPath(graph, from, to) {
  if (from === to) return [from]
  if (!graph.nodes[from] || !graph.nodes[to]) return null

  const adjacency = buildAdjacency(graph.edges)
  const visited = new Set([from])
  const queue = [from]
  const cameFrom = new Map()

  while (queue.length > 0) {
    const node = queue.shift()
    if (node === to) break
    for (const neighbor of adjacency.get(node) || []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      cameFrom.set(neighbor, node)
      queue.push(neighbor)
    }
  }

  if (!visited.has(to)) return null

  const path = [to]
  let node = to
  while (node !== from) {
    node = cameFrom.get(node)
    path.push(node)
  }
  path.reverse()
  return path
}

// Resolves a node-name path to world positions using graph.nodes.
export function pathToPositions(graph, nodeNames) {
  return nodeNames.map((name) => graph.nodes[name]).filter(Boolean)
}
