import { seededRandom } from '../scene/build/geometry'
import { FACING, hubInFrontOf, shuffle } from './streets'

const SHORE_Z = 10

function hubBuildings() {
  const masterHouse = { x: -26, z: -16 }
  const sailLoft = { x: 26, z: -16 }
  const shipyard = { x: -26, z: 6 }
  const breakwaterEnd = { x: 30, z: 26 }
  const dockEnd = { x: 0, z: 40 }

  const hubs = {
    town_square: { x: 0, y: 0, z: 0, label: 'Town Square', color: '#c9a959' },
    planning_room: { ...hubInFrontOf(masterHouse, 'east', 9), label: 'Planning Room', color: '#c084fc' },
    design_studio: { ...hubInFrontOf(sailLoft, 'west', 8), label: 'Design Studio', color: '#f472b6' },
    coding_desk: { ...hubInFrontOf(shipyard, 'east', 10), label: 'Coding Desk', color: '#60a5fa' },
    review_station: { x: breakwaterEnd.x, y: 0, z: breakwaterEnd.z - 4, label: 'Review Station', color: '#4ade80' },
    deploy_station: { x: dockEnd.x, y: 0, z: dockEnd.z - 6, label: 'Deploy Station', color: '#fbbf24' },
  }

  const structures = [
    { kind: 'house', x: masterHouse.x, z: masterHouse.z, rotation: FACING.east.rotation,
      params: { w: 9, d: 9, floors: 2, roof: 'hip', wall: '#c9b18a', roofColor: '#4a5f6b', windows: true, door: true } },
    { kind: 'tower', x: masterHouse.x - 6, z: masterHouse.z, rotation: 0,
      params: { radius: 1.8, height: 11, roof: 'cone', color: '#c9b18a', roofColor: '#4a5f6b', windows: true } },

    { kind: 'warehouse', x: sailLoft.x, z: sailLoft.z, rotation: FACING.west.rotation,
      params: { w: 12, d: 8, h: 5, color: '#c9b28a' } },

    { kind: 'warehouse', x: shipyard.x, z: shipyard.z, rotation: FACING.east.rotation,
      params: { w: 8, d: 10, h: 6, color: '#8a7a63' } },
    { kind: 'boat', x: shipyard.x + 8, z: shipyard.z + 2, rotation: Math.PI / 2, params: { length: 6, sail: false } },

    { kind: 'pier', x: breakwaterEnd.x, z: (SHORE_Z + breakwaterEnd.z) / 2, rotation: 0,
      params: { length: breakwaterEnd.z - SHORE_Z, width: 3, height: 1 } },
    { kind: 'rock', x: breakwaterEnd.x, z: breakwaterEnd.z, rotation: 0, params: { radius: 2.5, color: '#6b6558' } },
    { kind: 'lighthouse', x: breakwaterEnd.x, z: breakwaterEnd.z + 2, rotation: 0, params: { height: 14 } },

    { kind: 'pier', x: dockEnd.x, z: (SHORE_Z + dockEnd.z) / 2, rotation: 0,
      params: { length: dockEnd.z - SHORE_Z, width: 5, height: 1.2 } },
    { kind: 'boat', x: dockEnd.x - 2.5, z: dockEnd.z - 4, rotation: Math.PI / 2, params: { length: 9, sail: true } },
  ]

  return { hubs, structures }
}

function piers() {
  return [
    { kind: 'pier', x: -18, z: (SHORE_Z + 34) / 2, rotation: 0, params: { length: 34 - SHORE_Z, width: 4, height: 1.1 } },
    { kind: 'boat', x: -20, z: 20, rotation: Math.PI / 2, params: { length: 5, sail: true } },
    { kind: 'boat', x: -16, z: 30, rotation: Math.PI / 2, params: { length: 4.5, sail: false } },
  ]
}

function fishMarket() {
  return [
    { kind: 'marketStall', x: -6, z: -4, rotation: 0, params: { color: '#2a6f97' } },
    { kind: 'marketStall', x: 6, z: -4, rotation: 0, params: { color: '#3b6ab2' } },
    { kind: 'marketStall', x: -6, z: 4, rotation: Math.PI, params: { color: '#b23b3b' } },
    { kind: 'crate', x: 9, z: 2, rotation: 0.3, params: {} },
    { kind: 'barrel', x: -9, z: -2, rotation: 0, params: {} },
    { kind: 'barrel', x: -9.5, z: 0, rotation: 0, params: {} },
  ]
}

function fillerHouses(rng, count) {
  const wallColors = ['#d8c9a3', '#c9b28a', '#e0d4b0', '#cfae7a']
  const roofColors = ['#4a5f6b', '#6b4a2f', '#5a4a38']
  const sites = shuffle(rng, [
    { x: -40, z: -30 }, { x: -34, z: -32 }, { x: -18, z: -32 }, { x: -8, z: -30 },
    { x: 12, z: -32 }, { x: 20, z: -30 }, { x: 38, z: -28 }, { x: 40, z: -12 },
    { x: -40, z: -6 }, { x: -38, z: 10 }, { x: 8, z: -26 }, { x: -14, z: -26 },
  ])
  return sites.slice(0, count).map((site, i) => ({
    kind: 'house',
    x: site.x,
    z: site.z,
    rotation: Math.round(rng() * 4) * (Math.PI / 2),
    params: {
      w: 4.5 + rng() * 2,
      d: 4.5 + rng() * 2,
      floors: rng() < 0.3 ? 2 : 1,
      roof: rng() < 0.5 ? 'gable' : 'hip',
      wall: wallColors[i % wallColors.length],
      roofColor: roofColors[i % roofColors.length],
      chimney: rng() < 0.3,
    },
  }))
}

function shoreDecor(rng) {
  const items = []
  for (let i = 0; i < 10; i++) {
    const x = -46 + rng() * 92
    const z = SHORE_Z - 2 + rng() * 3
    items.push({ kind: 'rock', x, z, rotation: 0, params: { radius: 0.7 + rng() * 0.8, color: '#7a7568' } })
  }
  for (let i = 0; i < 8; i++) {
    const angle = rng() * Math.PI * 2
    const radius = 10 + rng() * 30
    items.push({
      kind: 'tree', x: Math.cos(angle) * radius, z: -20 + Math.sin(angle) * radius - 15, rotation: 0,
      params: { height: 4 + rng() * 2, variant: rng() < 0.5 ? 'palm' : 'round' },
    })
  }
  for (let i = 0; i < 6; i++) {
    items.push({ kind: rng() < 0.5 ? 'crate' : 'barrel', x: -30 + rng() * 60, z: SHORE_Z - 4 + rng() * 6, rotation: rng() * Math.PI, params: {} })
  }
  return items
}

function lampPosts() {
  const posts = []
  for (const x of [-6, 6, -6, 6]) {
    posts.push({ kind: 'lampPost', x, z: -12, rotation: 0, params: { lit: true } })
  }
  for (const z of [-24, -8, 8]) {
    posts.push({ kind: 'lampPost', x: -32, z, rotation: 0, params: { lit: true } })
    posts.push({ kind: 'lampPost', x: 32, z, rotation: 0, params: { lit: true } })
  }
  return posts
}

function buildGraph(hubs) {
  const nodes = {
    town_square: hubs.town_square,
    nw_mid: { x: -12, y: 0, z: -8 },
    ne_mid: { x: 12, y: 0, z: -8 },
    w_shore: { x: -12, y: 0, z: 4 },
    shore_mid: { x: 0, y: 0, z: SHORE_Z },
    dock_mid: { x: 0, y: 0, z: 26 },
    break_mid: { x: 20, y: 0, z: 14 },
    planning_room: hubs.planning_room,
    design_studio: hubs.design_studio,
    coding_desk: hubs.coding_desk,
    review_station: hubs.review_station,
    deploy_station: hubs.deploy_station,
  }
  const edges = [
    ['town_square', 'nw_mid'], ['nw_mid', 'planning_room'],
    ['town_square', 'ne_mid'], ['ne_mid', 'design_studio'],
    ['town_square', 'w_shore'], ['w_shore', 'coding_desk'],
    ['town_square', 'shore_mid'],
    ['shore_mid', 'dock_mid'], ['dock_mid', 'deploy_station'],
    ['shore_mid', 'break_mid'], ['break_mid', 'review_station'],
  ]
  return { nodes, edges }
}

function generateHarborWorld() {
  const rng = seededRandom(2002)
  const { hubs, structures: hubStructures } = hubBuildings()

  const structures = [
    ...hubStructures,
    ...fishMarket(),
    ...piers(),
    ...fillerHouses(rng, 10),
    ...shoreDecor(rng),
    ...lampPosts(),
  ]

  return {
    id: 'harbor',
    name: 'Saltmarsh Harbor',
    description: 'Fishing town on a working waterfront',
    sky: '#e8a45c',
    fog: { color: '#e8a45c', near: 80, far: 260 },
    ground: { size: 150, color: '#7aa062', x: 0, z: SHORE_Z - 75 },
    water: { level: -0.6, color: '#3f7a86' },
    roadColor: '#a89078',
    roadWidth: 3.5,
    plazas: [{ x: 0, z: 0, radius: 12, color: '#8a7a63' }],
    structures,
    clouds: [
      { x: -30, y: 30, z: -40, scale: 3, speed: 0.5 },
      { x: 25, y: 34, z: 40, scale: 2.6, speed: 0.4 },
    ],
    ambient: { intensity: 0.9, color: '#ffe8c8' },
    hemisphere: { sky: '#f5c98a', ground: '#5a8a6a', intensity: 1.0 },
    sun: { position: [-35, 30, 20], intensity: 1.7, color: '#ffb870' },
    characterScale: 0.8,
    camera: { position: [-44, 24, 52], target: [0, 3, 8] },
    hubs,
    graph: buildGraph(hubs),
  }
}

export default generateHarborWorld()
