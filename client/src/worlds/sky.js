const RING_RADIUS = 28

const RING = [
  { name: 'deploy_station', label: 'Deploy Station', color: '#fbbf24', y: 1, radius: 10 },
  { name: 'design_studio', label: 'Design Studio', color: '#f472b6', y: 4, radius: 9 },
  { name: 'planning_room', label: 'Planning Room', color: '#c084fc', y: 7, radius: 10 },
  { name: 'review_station', label: 'Review Station', color: '#4ade80', y: 9, radius: 8 },
  { name: 'coding_desk', label: 'Coding Desk', color: '#60a5fa', y: 6, radius: 9 },
  { name: 'town_square', label: 'Town Square', color: '#c9a959', y: 3, radius: 12 },
]

function ringPosition(i) {
  const angle = (i / RING.length) * Math.PI * 2
  return { x: Math.cos(angle) * RING_RADIUS, z: Math.sin(angle) * RING_RADIUS }
}

function buildPlatforms() {
  const hubs = {}
  const platforms = []
  RING.forEach((entry, i) => {
    const pos = ringPosition(i)
    hubs[entry.name] = { x: pos.x, y: entry.y, z: pos.z, label: entry.label, color: entry.color }
    platforms.push({
      kind: 'platform', x: pos.x, y: entry.y, z: pos.z, rotation: 0,
      params: { radius: entry.radius, thickness: 2.4, top: '#6f9e5c', rock: '#5a5248' },
    })
  })
  return { hubs, platforms }
}

function hubStructures(hubs) {
  return [
    { kind: 'tower', x: hubs.planning_room.x, y: hubs.planning_room.y, z: hubs.planning_room.z, rotation: 0,
      params: { radius: 1.8, height: 13, roof: 'cone', color: '#7a6a95', roofColor: '#c9a5e8', windows: true, glow: true } },

    { kind: 'dome', x: hubs.design_studio.x, y: hubs.design_studio.y, z: hubs.design_studio.z, rotation: 0,
      params: { radius: 4, baseHeight: 3, color: '#8a97a8', glassColor: '#bcd9e8' } },

    { kind: 'windmill', x: hubs.coding_desk.x, y: hubs.coding_desk.y, z: hubs.coding_desk.z, rotation: 0,
      params: { towerHeight: 7, radius: 1.4, bladeLength: 2.8, color: '#c9b28a' } },

    { kind: 'lighthouse', x: hubs.review_station.x, y: hubs.review_station.y, z: hubs.review_station.z, rotation: 0,
      params: { height: 12 } },

    { kind: 'pier', x: hubs.deploy_station.x, y: hubs.deploy_station.y, z: hubs.deploy_station.z - 3, rotation: 0,
      params: { length: 6, width: 4, height: 0.3 } },
    { kind: 'airship', x: hubs.deploy_station.x, y: hubs.deploy_station.y + 3, z: hubs.deploy_station.z + 2,
      rotation: Math.PI / 5, params: { length: 8, color: '#c9a959' } },

    { kind: 'fountain', x: hubs.town_square.x, y: hubs.town_square.y, z: hubs.town_square.z, rotation: 0,
      params: { radius: 3 } },
    { kind: 'bench', x: hubs.town_square.x - 5, y: hubs.town_square.y, z: hubs.town_square.z, rotation: Math.PI / 2, params: {} },
    { kind: 'bench', x: hubs.town_square.x + 5, y: hubs.town_square.y, z: hubs.town_square.z, rotation: -Math.PI / 2, params: {} },
  ]
}

function bridges(hubs) {
  const parts = []
  const edges = []
  for (let i = 0; i < RING.length; i++) {
    const a = RING[i]
    const b = RING[(i + 1) % RING.length]
    const posA = hubs[a.name]
    const posB = hubs[b.name]
    const dx = posB.x - posA.x
    const dz = posB.z - posA.z
    const dist = Math.hypot(dx, dz)
    const dirX = dx / dist
    const dirZ = dz / dist
    const edgeA = { x: posA.x + dirX * a.radius, z: posA.z + dirZ * a.radius }
    const edgeB = { x: posB.x - dirX * b.radius, z: posB.z - dirZ * b.radius }
    const length = Math.hypot(edgeB.x - edgeA.x, edgeB.z - edgeA.z)
    parts.push({
      kind: 'ropeBridge',
      x: (edgeA.x + edgeB.x) / 2,
      y: (posA.y + posB.y) / 2,
      z: (edgeA.z + edgeB.z) / 2,
      rotation: Math.atan2(edgeB.x - edgeA.x, edgeB.z - edgeA.z),
      params: { length, width: 2.2 },
    })
    edges.push([a.name, b.name])
  }
  return { parts, edges }
}

function clouds() {
  const items = []
  const seeds = [
    [10, -2, 10, 3], [-16, 1, -8, 2.4], [22, 4, -18, 3.4], [-8, -4, 20, 2],
    [0, 2, -30, 3.8], [30, 0, 8, 2.6], [-30, 3, -4, 3], [8, -3, -34, 2.2],
  ]
  for (const [x, y, z, scale] of seeds) {
    items.push({ x, y, z, scale, speed: 0.3 + (Math.abs(x) % 3) * 0.1 })
  }
  return items
}

function generateSkyWorld() {
  const { hubs, platforms } = buildPlatforms()
  const { parts: bridgeParts, edges } = bridges(hubs)

  const structures = [...platforms, ...hubStructures(hubs), ...bridgeParts]

  const nodes = {}
  for (const entry of RING) nodes[entry.name] = hubs[entry.name]

  return {
    id: 'sky',
    name: 'Cloudspire',
    description: 'Floating platforms above the clouds',
    sky: '#2b4590',
    fog: { color: '#2b4590', near: 60, far: 190 },
    ground: null,
    water: null,
    roadColor: null,
    roadWidth: 0,
    plazas: [],
    structures,
    clouds: clouds(),
    ambient: { intensity: 1.2, color: '#dfe6ff' },
    hemisphere: { sky: '#7f9be0', ground: '#405080', intensity: 1.3 },
    sun: { position: [30, 45, 20], intensity: 1.6, color: '#fff2e0' },
    characterScale: 0.8,
    camera: { position: [38, 22, 44], target: [0, 5, 0] },
    hubs,
    graph: { nodes, edges },
  }
}

export default generateSkyWorld()
