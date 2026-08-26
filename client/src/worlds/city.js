import { seededRandom } from '../scene/build/geometry'
import { FACING, hubInFrontOf } from './streets'

const SPACING = 26

function hubBuildings() {
  const hq = { x: 0, z: -34 }
  const studio = { x: 0, z: 34 }
  const campus = { x: -34, z: 0 }
  const lab = { x: 34, z: 0 }
  const launch = { x: -34, z: -34 }

  const hubs = {
    town_square: { x: 0, y: 0, z: 0, label: 'Town Square', color: '#c9a959' },
    planning_room: { ...hubInFrontOf(hq, 'south', 12), label: 'Planning Room', color: '#c084fc' },
    design_studio: { ...hubInFrontOf(studio, 'north', 16), label: 'Design Studio', color: '#f472b6' },
    coding_desk: { ...hubInFrontOf(campus, 'east', 12), label: 'Coding Desk', color: '#60a5fa' },
    review_station: { ...hubInFrontOf(lab, 'west', 10), label: 'Review Station', color: '#4ade80' },
    deploy_station: { x: launch.x + 9, y: 0, z: launch.z + 9, label: 'Deploy Station', color: '#fbbf24' },
  }

  const structures = [
    { kind: 'skyscraper', x: hq.x, z: hq.z, rotation: FACING.south.rotation,
      params: { w: 12, d: 12, h: 42, windowRows: 13, windowCols: 4, glow: true, color: '#232a33' } },

    { kind: 'skyscraper', x: studio.x, z: studio.z, rotation: FACING.north.rotation,
      params: { w: 17, d: 9, h: 9, windowRows: 3, windowCols: 7, glow: true, color: '#2a3038' } },

    { kind: 'skyscraper', x: campus.x - 7, z: campus.z - 5, rotation: 0,
      params: { w: 9, d: 9, h: 20, windowRows: 7, windowCols: 3, glow: true, color: '#333b45' } },
    { kind: 'skyscraper', x: campus.x - 7, z: campus.z + 6, rotation: 0,
      params: { w: 9, d: 9, h: 24, windowRows: 8, windowCols: 3, glow: true, color: '#2e3540' } },
    { kind: 'skyscraper', x: campus.x - 15, z: campus.z, rotation: 0,
      params: { w: 8, d: 9, h: 17, windowRows: 6, windowCols: 3, glow: true, color: '#37404b' } },

    { kind: 'skyscraper', x: lab.x, z: lab.z, rotation: 0,
      params: { w: 11, d: 11, h: 15, windowRows: 5, windowCols: 4, glow: true, color: '#2a3038' } },
    { kind: 'dish', x: lab.x, z: lab.z, y: 15, rotation: 0.6, params: { height: 3, radius: 2.2 } },

    { kind: 'gantry', x: launch.x, z: launch.z - 10, rotation: 0, params: { height: 24, spread: 3 } },
    { kind: 'skyscraper', x: launch.x - 10, z: launch.z + 6, rotation: 0,
      params: { w: 8, d: 7, h: 10, windowRows: 3, windowCols: 3, glow: true, color: '#333b45' } },
  ]

  return { hubs, structures }
}

function parkDecor() {
  return [
    { kind: 'tree', x: -6, z: -5, rotation: 0, params: { height: 4.5, variant: 'round' } },
    { kind: 'tree', x: 6, z: -5, rotation: 0, params: { height: 4, variant: 'round' } },
    { kind: 'tree', x: -6, z: 5, rotation: 0, params: { height: 4.2, variant: 'round' } },
    { kind: 'tree', x: 6, z: 5, rotation: 0, params: { height: 4, variant: 'round' } },
    { kind: 'bench', x: -3, z: 0, rotation: Math.PI / 2, params: {} },
    { kind: 'bench', x: 3, z: 0, rotation: -Math.PI / 2, params: {} },
    { kind: 'crate', x: 8, z: 8, rotation: 0.3, params: { color: '#4a4a4a' } },
  ]
}

const HEIGHTS = [14, 18, 22, 16, 28, 34, 12, 20, 38, 26, 40, 15, 30, 44]
const COLORS = ['#2a3038', '#333b45', '#28303a', '#3a4048', '#232a33', '#2e3540']

function blockTowers(rng, blockX, blockZ, count, maxHeight) {
  const heights = HEIGHTS.filter((h) => h <= maxHeight)
  const towers = []
  const placed = []
  let attempts = 0
  while (towers.length < count && attempts < count * 12) {
    attempts++
    const x = blockX + (rng() - 0.5) * 16
    const z = blockZ + (rng() - 0.5) * 16
    if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < 8)) continue
    placed.push({ x, z })
    const h = heights[Math.floor(rng() * heights.length)]
    const w = 6 + rng() * 4
    const d = 6 + rng() * 4
    towers.push({
      kind: 'skyscraper',
      x, z, rotation: Math.round(rng() * 4) * (Math.PI / 2),
      params: {
        w, d, h,
        windowRows: Math.max(3, Math.round(h / 3.2)),
        windowCols: 3,
        glow: true,
        color: COLORS[Math.floor(rng() * COLORS.length)],
      },
    })
  }
  return towers
}

function filler(rng) {
  // The camera sits at +x +z: keep that block low so the park stays visible, put the skyline behind it.
  const blocks = [[-13, -13, 44], [13, -13, 26], [-13, 13, 26], [13, 13, 14]]
  const keepOut = [
    { x: 0, z: -34, r: 12 }, { x: 0, z: 34, r: 14 }, { x: -34, z: 0, r: 18 },
    { x: 34, z: 0, r: 10 }, { x: -34, z: -34, r: 16 }, { x: 0, z: 0, r: 12 },
  ]
  const towers = []
  for (const [bx, bz, maxHeight] of blocks) {
    const candidates = blockTowers(rng, bx, bz, 6, maxHeight)
    for (const t of candidates) {
      if (keepOut.some((k) => Math.hypot(t.x - k.x, t.z - k.z) < k.r)) continue
      towers.push(t)
    }
  }
  return towers
}

function lampPosts() {
  const posts = []
  for (const [x, z] of [[-6, -12], [6, -12], [-6, 12], [6, 12], [-12, -6], [-12, 6], [12, -6], [12, 6]]) {
    posts.push({ kind: 'lampPost', x, z, rotation: 0, params: { lit: true } })
  }
  return posts
}

function buildGraph(hubs) {
  const nodes = {
    town_square: hubs.town_square,
    c10: { x: 0, y: 0, z: -SPACING },
    c12: { x: 0, y: 0, z: SPACING },
    c01: { x: -SPACING, y: 0, z: 0 },
    c21: { x: SPACING, y: 0, z: 0 },
    c00: { x: -SPACING, y: 0, z: -SPACING },
    c20: { x: SPACING, y: 0, z: -SPACING },
    c02: { x: -SPACING, y: 0, z: SPACING },
    c22: { x: SPACING, y: 0, z: SPACING },
    planning_room: hubs.planning_room,
    design_studio: hubs.design_studio,
    coding_desk: hubs.coding_desk,
    review_station: hubs.review_station,
    deploy_station: hubs.deploy_station,
  }
  const edges = [
    ['c00', 'c10'], ['c10', 'c20'], ['c01', 'town_square'], ['town_square', 'c21'], ['c02', 'c12'], ['c12', 'c22'],
    ['c00', 'c01'], ['c01', 'c02'], ['c10', 'town_square'], ['town_square', 'c12'], ['c20', 'c21'], ['c21', 'c22'],
    ['c10', 'planning_room'], ['c12', 'design_studio'], ['c01', 'coding_desk'], ['c21', 'review_station'],
    ['c00', 'deploy_station'],
  ]
  return { nodes, edges }
}

function generateCityWorld() {
  const rng = seededRandom(3003)
  const { hubs, structures: hubStructures } = hubBuildings()

  const structures = [
    ...hubStructures,
    ...parkDecor(),
    ...filler(rng),
    ...lampPosts(),
  ]

  return {
    id: 'city',
    name: 'Night City',
    description: 'A dense skyline after dark',
    sky: '#141b30',
    fog: { color: '#141b30', near: 90, far: 360 },
    ground: { size: 220, color: '#5a606e' },
    water: null,
    roadColor: '#7c8090',
    roadWidth: 6,
    plazas: [{ x: 0, z: 0, radius: 13, color: '#545863' }, { x: -34, z: -34, radius: 10, color: '#544e3d' }],
    structures,
    clouds: [],
    ambient: { intensity: 1.6, color: '#8fa0d8' },
    hemisphere: { sky: '#6f84c4', ground: '#4a5062', intensity: 1.6 },
    sun: { position: [-30, 50, -20], intensity: 1.5, color: '#b8c6f0' },
    characterScale: 0.8,
    camera: { position: [50, 32, 56], target: [0, 3, 0] },
    hubs,
    graph: buildGraph(hubs),
  }
}

export default generateCityWorld()
