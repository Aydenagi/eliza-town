import { seededRandom } from '../scene/build/geometry'
import { FACING, hubInFrontOf, shuffle } from './streets'

const WALL_HALF = 42

function ringWall(color) {
  const parts = []
  const gateHalf = 4
  parts.push({ kind: 'wallRun', x: 0, z: -WALL_HALF, rotation: 0, params: { length: WALL_HALF * 2, height: 5, color } })
  const southLen = WALL_HALF - gateHalf
  parts.push({ kind: 'wallRun', x: -(gateHalf + southLen / 2), z: WALL_HALF, rotation: 0, params: { length: southLen, height: 5, color } })
  parts.push({ kind: 'wallRun', x: gateHalf + southLen / 2, z: WALL_HALF, rotation: 0, params: { length: southLen, height: 5, color } })
  parts.push({ kind: 'wallRun', x: -WALL_HALF, z: 0, rotation: Math.PI / 2, params: { length: WALL_HALF * 2, height: 5, color } })
  parts.push({ kind: 'wallRun', x: WALL_HALF, z: 0, rotation: Math.PI / 2, params: { length: WALL_HALF * 2, height: 5, color } })
  parts.push({ kind: 'gate', x: 0, z: WALL_HALF, rotation: 0, params: { width: gateHalf * 2, height: 6, depth: 3, color } })

  const corners = [[-WALL_HALF, -WALL_HALF], [WALL_HALF, -WALL_HALF], [WALL_HALF, WALL_HALF], [-WALL_HALF, WALL_HALF]]
  for (const [x, z] of corners) {
    parts.push({ kind: 'tower', x, z, rotation: 0, params: { radius: 2.6, height: 9, roof: 'crenel', color, windows: false } })
  }
  return parts
}

function hubBuildings() {
  const hallCenter = { x: 0, z: -26 }
  const studioCenter = { x: 26, z: 0 }
  const forgeCenter = { x: -26, z: 0 }
  const towerCenter = { x: 16, z: -20 }
  const stablesCenter = { x: -8, z: 34 }

  const hubs = {
    town_square: { x: 0, y: 0, z: 0, label: 'Town Square', color: '#c9a959' },
    planning_room: { ...hubInFrontOf(hallCenter, 'south', 9), label: 'Planning Room', color: '#c084fc' },
    design_studio: { ...hubInFrontOf(studioCenter, 'west', 9), label: 'Design Studio', color: '#f472b6' },
    coding_desk: { ...hubInFrontOf(forgeCenter, 'east', 8), label: 'Coding Desk', color: '#60a5fa' },
    review_station: { x: 16, y: 0, z: -16, label: 'Review Station', color: '#4ade80' },
    deploy_station: { x: 0, y: 0, z: 34, label: 'Deploy Station', color: '#fbbf24' },
  }

  const structures = [
    { kind: 'house', x: hallCenter.x, z: hallCenter.z, rotation: FACING.south.rotation,
      params: { w: 11, d: 9, floors: 2, roof: 'hip', wall: '#c9b18a', roofColor: '#7a3030', windows: true, door: true } },
    { kind: 'tower', x: hallCenter.x + 8, z: hallCenter.z, rotation: 0,
      params: { radius: 2.2, height: 15, roof: 'crenel', color: '#c9b18a', windows: true } },

    { kind: 'house', x: studioCenter.x, z: studioCenter.z, rotation: FACING.west.rotation,
      params: { w: 9, d: 9, floors: 2, roof: 'gable', wall: '#e0d4b0', trim: '#5c4530', roofColor: '#6b4a2f', timber: true, windows: true, door: true } },

    { kind: 'house', x: forgeCenter.x, z: forgeCenter.z, rotation: FACING.east.rotation,
      params: { w: 8, d: 8, floors: 1, roof: 'gable', wall: '#8a7a6b', roofColor: '#4a3a2f', chimney: true, windows: true, door: true } },
    { kind: 'warehouse', x: forgeCenter.x - 6, z: forgeCenter.z + 6, rotation: FACING.east.rotation,
      params: { w: 5, d: 6, h: 3.2, color: '#7a6a58' } },

    { kind: 'tower', x: towerCenter.x, z: towerCenter.z, rotation: 0,
      params: { radius: 2.8, height: 16, roof: 'crenel', color: '#8a8378', windows: true } },

    { kind: 'house', x: stablesCenter.x, z: stablesCenter.z, rotation: FACING.east.rotation,
      params: { w: 7, d: 5, floors: 1, roof: 'gable', wall: '#8a7a63', roofColor: '#5a4a38', windows: false, door: true } },
  ]

  return { hubs, structures }
}

function collectHouseSites(rng, keepOut) {
  const sites = []
  for (let x = -34; x <= 34; x += 8) {
    for (let z = -34; z <= 34; z += 8) {
      if (Math.abs(x) < 4 || Math.abs(z) < 4) continue
      const distToOrigin = Math.hypot(x, z)
      if (distToOrigin > 8 && distToOrigin < 13) continue
      if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue
      sites.push({ x: x + (rng() - 0.5) * 3, z: z + (rng() - 0.5) * 3 })
    }
  }
  return shuffle(rng, sites)
}

function fillerHouses(rng, keepOut, count) {
  const wallColors = ['#d8c9a3', '#c9b28a', '#e0d4b0', '#cfae7a', '#b8a888']
  const roofColors = ['#8b3a3a', '#6b4a2f', '#5a4a38', '#7a5a3a']
  const roofs = ['gable', 'hip', 'gable', 'cone']
  return collectHouseSites(rng, keepOut).slice(0, count).map((site, i) => ({
    kind: 'house',
    x: site.x,
    z: site.z,
    rotation: Math.round(rng() * 4) * (Math.PI / 2),
    params: {
      w: 4.5 + rng() * 2.5,
      d: 4.5 + rng() * 2.5,
      floors: rng() < 0.3 ? 2 : 1,
      roof: roofs[i % roofs.length],
      wall: wallColors[i % wallColors.length],
      roofColor: roofColors[i % roofColors.length],
      timber: rng() < 0.3,
      chimney: rng() < 0.25,
    },
  }))
}

function forestBelt(rng, count) {
  const trees = []
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const radius = 48 + rng() * 45
    trees.push({
      kind: 'tree', x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, rotation: 0,
      params: { height: 4 + rng() * 3, variant: rng() < 0.6 ? 'round' : 'pine' },
    })
  }
  return trees
}

function insideTrees(rng, count) {
  const trees = []
  let attempts = 0
  while (trees.length < count && attempts < count * 20) {
    attempts++
    const x = (rng() - 0.5) * 68
    const z = (rng() - 0.5) * 68
    if (Math.abs(x) < 5 || Math.abs(z) < 5) continue
    if (Math.hypot(x, z) < 15) continue
    trees.push({ kind: 'tree', x, z, rotation: 0, params: { height: 3.5 + rng() * 2, variant: 'round' } })
  }
  return trees
}

function lampPosts() {
  const arms = [[0, -1], [0, 1], [1, 0], [-1, 0]]
  const posts = []
  for (const [dx, dz] of arms) {
    for (const dist of [7, 16]) {
      for (const side of [-1, 1]) {
        posts.push({
          kind: 'lampPost',
          x: dx * dist + -dz * side * 2.3,
          z: dz * dist + dx * side * 2.3,
          rotation: 0,
          params: { lit: true },
        })
      }
    }
  }
  return posts
}

function plazaDecor() {
  const flagColors = ['#c0392b', '#2a6f97', '#2f9e44', '#e8b923']
  const flags = [[4, 4], [-4, 4], [4, -4], [-4, -4]].map(([x, z], i) => ({
    kind: 'flagPole', x, z, rotation: 0, params: { color: flagColors[i] },
  }))
  const stalls = [[8, 6], [-8, 6], [8, -6], [-8, -6]].map(([x, z]) => ({
    kind: 'marketStall', x, z, rotation: Math.atan2(-x, -z), params: { color: x > 0 ? '#b23b3b' : '#3b6ab2' },
  }))
  const props = [
    { kind: 'bench', x: -6, z: 5.5, rotation: Math.PI / 2, params: {} },
    { kind: 'bench', x: 6, z: 5.5, rotation: -Math.PI / 2, params: {} },
    { kind: 'crate', x: 9.5, z: -3, rotation: 0, params: {} },
    { kind: 'barrel', x: 10, z: -1, rotation: 0, params: {} },
    { kind: 'barrel', x: -9.5, z: 3, rotation: 0, params: {} },
    { kind: 'crate', x: -10, z: 5, rotation: 0.4, params: {} },
  ]
  return [{ kind: 'fountain', x: 0, z: 0, rotation: 0, params: { radius: 3 } }, ...flags, ...stalls, ...props]
}

function buildGraph(hubs) {
  const nodes = {
    town_square: hubs.town_square,
    n_mid: { x: 0, y: 0, z: -10 },
    s_mid: { x: 0, y: 0, z: 10 },
    e_mid: { x: 10, y: 0, z: 0 },
    w_mid: { x: -10, y: 0, z: 0 },
    deploy_mid: { x: 0, y: 0, z: 20 },
    review_spur: { x: 13, y: 0, z: -8 },
    planning_room: hubs.planning_room,
    design_studio: hubs.design_studio,
    coding_desk: hubs.coding_desk,
    review_station: hubs.review_station,
    deploy_station: hubs.deploy_station,
  }
  const edges = [
    ['town_square', 'n_mid'], ['n_mid', 'planning_room'],
    ['town_square', 'e_mid'], ['e_mid', 'design_studio'],
    ['town_square', 'w_mid'], ['w_mid', 'coding_desk'],
    ['town_square', 's_mid'], ['s_mid', 'deploy_mid'], ['deploy_mid', 'deploy_station'],
    ['n_mid', 'e_mid'], ['e_mid', 's_mid'], ['s_mid', 'w_mid'], ['w_mid', 'n_mid'],
    ['e_mid', 'review_spur'], ['review_spur', 'review_station'],
  ]
  return { nodes, edges }
}

function generateTownWorld() {
  const rng = seededRandom(1001)
  const { hubs, structures: hubStructures } = hubBuildings()

  const keepOut = [
    { x: 0, z: 0, r: 15 },
    { x: hubs.planning_room.x, z: hubs.planning_room.z, r: 8 }, { x: 0, z: -26, r: 8 },
    { x: hubs.design_studio.x, z: hubs.design_studio.z, r: 8 }, { x: 26, z: 0, r: 8 },
    { x: hubs.coding_desk.x, z: hubs.coding_desk.z, r: 8 }, { x: -26, z: 0, r: 8 }, { x: -32, z: 6, r: 6 },
    { x: hubs.review_station.x, z: hubs.review_station.z, r: 6 }, { x: 16, z: -20, r: 6 },
    { x: hubs.deploy_station.x, z: hubs.deploy_station.z, r: 8 }, { x: -8, z: 34, r: 6 }, { x: 0, z: WALL_HALF - 4, r: 7 },
  ]

  const structures = [
    ...ringWall('#a89a82'),
    ...hubStructures,
    ...plazaDecor(),
    ...fillerHouses(rng, keepOut, 18),
    ...forestBelt(rng, 22),
    ...insideTrees(rng, 9),
    ...lampPosts(),
  ]

  return {
    id: 'town',
    name: 'Medieval Town',
    description: 'Walled town on a green plain',
    sky: '#7ec8e3',
    fog: { color: '#a9d8ec', near: 70, far: 230 },
    ground: { size: 220, color: '#4a7c4e' },
    water: null,
    roadColor: '#8a7a63',
    roadWidth: 3.5,
    plazas: [{ x: 0, z: 0, radius: 14, color: '#5c5548' }],
    structures,
    clouds: [
      { x: -30, y: 32, z: -20, scale: 3.2, speed: 0.6 },
      { x: 20, y: 36, z: 25, scale: 2.4, speed: 0.4 },
      { x: 0, y: 30, z: -55, scale: 2, speed: 0.5 },
    ],
    ambient: { intensity: 0.55, color: '#fff5e6' },
    hemisphere: { sky: '#bfe3f5', ground: '#4a7c4e', intensity: 0.5 },
    sun: { position: [40, 45, 25], intensity: 1.5, color: '#fff2d8' },
    characterScale: 0.8,
    camera: { position: [28, 24, 46], target: [0, 2, -6] },
    hubs,
    graph: buildGraph(hubs),
  }
}

export default generateTownWorld()
