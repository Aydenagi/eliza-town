import { hexToWorld, hexKey, hexFill, hexFillAround, hexLine, seededRandom } from './hex'
import { carveRoads, tileMapToArray, scatterProps } from './layout'

const S = 3
const MAIN_RADIUS = 6
const WATER_RADIUS = 14
const ISLET_CENTER = { q: 0, r: -12 }
const ISLET_RADIUS = 1

const HUB_CELLS = {
  town_square: { q: 0, r: 0 },
  planning_room: { q: -4, r: -2 },
  design_studio: { q: 4, r: -2 },
  coding_desk: { q: -4, r: 2 },
  review_station: { q: 3, r: 3 },
}

const HUB_META = {
  town_square: { label: 'Town Square', color: '#c9a959' },
  planning_room: { label: 'Planning Room', color: '#c084fc' },
  design_studio: { label: 'Design Studio', color: '#f472b6' },
  coding_desk: { label: 'Coding Desk', color: '#60a5fa' },
  review_station: { label: 'Review Station', color: '#4ade80' },
  deploy_station: { label: 'Deploy Station', color: '#fbbf24' },
}

const ROAD_CONNECTIONS = [
  ['town_square', 'planning_room'],
  ['town_square', 'design_studio'],
  ['town_square', 'coding_desk'],
  ['town_square', 'review_station'],
]

function buildTileLayers() {
  const tileMap = new Map()
  for (const cell of hexFill(MAIN_RADIUS)) {
    tileMap.set(hexKey(cell.q, cell.r), { type: 'hex_grass', q: cell.q, r: cell.r, y: 0, rotation: 0 })
  }
  for (const cell of hexFillAround(ISLET_CENTER, ISLET_RADIUS)) {
    tileMap.set(hexKey(cell.q, cell.r), { type: 'hex_grass', q: cell.q, r: cell.r, y: 0, rotation: 0 })
  }
  for (const cell of hexFill(WATER_RADIUS)) {
    const key = hexKey(cell.q, cell.r)
    if (!tileMap.has(key)) {
      tileMap.set(key, { type: 'hex_water', q: cell.q, r: cell.r, y: 0, rotation: 0 })
    }
  }
  return tileMap
}

function buildBridge(tileMap) {
  const deployCell = ISLET_CENTER
  const line = hexLine(HUB_CELLS.town_square, deployCell)
  const gapCells = line.filter((cell) => tileMap.get(hexKey(cell.q, cell.r))?.type === 'hex_water')

  const nodes = { deploy_station: hexToWorld(deployCell.q, deployCell.r, S) }
  const edges = []
  const props = []
  let prevName = 'town_square'
  let prevPos = hexToWorld(HUB_CELLS.town_square.q, HUB_CELLS.town_square.r, S)

  gapCells.forEach((cell, i) => {
    const pos = hexToWorld(cell.q, cell.r, S, S * 0.25)
    const name = `bridge_${i}`
    nodes[name] = pos
    edges.push([prevName, name])
    const dx = pos.x - prevPos.x
    const dz = pos.z - prevPos.z
    props.push({ category: 'buildings', name: 'building_bridge_A', x: pos.x, y: 0, z: pos.z, rotation: Math.atan2(dx, dz), scale: S })
    prevName = name
    prevPos = pos
  })
  edges.push([prevName, 'deploy_station'])

  return { nodes, edges, props }
}

function buildHubs() {
  const hubs = {}
  for (const [name, cell] of Object.entries(HUB_CELLS)) {
    const pos = hexToWorld(cell.q, cell.r, S)
    hubs[name] = { ...pos, ...HUB_META[name] }
  }
  const deployPos = hexToWorld(ISLET_CENTER.q, ISLET_CENTER.r, S)
  hubs.deploy_station = { ...deployPos, ...HUB_META.deploy_station }
  return hubs
}

function buildDecorations(tileMap, rng) {
  const grassCells = Array.from(tileMap.values()).filter((t) => t.type === 'hex_grass')
  const waterCells = Array.from(tileMap.values()).filter((t) => t.type === 'hex_water')
  const mainGrass = grassCells.filter((c) => hexToWorld(c.q, c.r, S).z > -30)

  return [
    ...scatterProps(mainGrass, rng, { count: 5, category: 'nature', names: ['hill_single_A', 'hill_single_B', 'hill_single_C'], S, scale: [0.8, 1.1] }),
    ...scatterProps(mainGrass, rng, { count: 6, category: 'nature', names: ['rock_single_A', 'rock_single_B', 'rock_single_D'], S, scale: [0.7, 1] }),
    ...scatterProps(mainGrass, rng, { count: 4, category: 'buildings', names: ['fence_wood_straight'], S, scale: [0.9, 1] }),
    ...scatterProps(mainGrass, rng, { count: 2, category: 'props', names: ['tent'], S, scale: [1, 1.1] }),
    ...scatterProps(waterCells, rng, { count: 10, category: 'nature', names: ['waterlily_A', 'waterlily_B'], S, scale: [0.6, 0.9] }),
    ...scatterProps(waterCells, rng, { count: 6, category: 'nature', names: ['waterplant_A', 'waterplant_B', 'waterplant_C'], S, scale: [0.6, 0.9] }),
  ]
}

function generateIslandWorld() {
  const rng = seededRandom(2002)
  const tileMap = buildTileLayers()
  const { nodes: roadWaypoints, edges: roadEdges } = carveRoads(tileMap, S, HUB_CELLS, ROAD_CONNECTIONS)
  const bridge = buildBridge(tileMap)
  const hubs = buildHubs()

  const graphNodes = { ...roadWaypoints, ...bridge.nodes }
  for (const [name, hub] of Object.entries(hubs)) {
    graphNodes[name] = { x: hub.x, y: hub.y, z: hub.z }
  }

  return {
    id: 'island',
    name: 'Lily Isle',
    description: 'Grass island ringed by water, with a bridged islet for deployment',
    sky: '#f4b183',
    fog: { color: '#f4b183', near: 60, far: 220 },
    groundColor: null,
    ambient: { intensity: 0.55, color: '#ffd9a8' },
    sun: { position: [-25, 25, 15], intensity: 1.3, color: '#ffb87a' },
    scale: S,
    characterScale: 0.7,
    camera: { position: [38, 27, 38], target: [0, 0, -10] },
    tiles: tileMapToArray(tileMap),
    props: [...bridge.props, ...buildDecorations(tileMap, rng)],
    clouds: [
      { x: -25, y: 28, z: -25, scale: S * 1.2, speed: 0.5 },
      { x: 22, y: 30, z: 10, scale: S, speed: 0.4 },
    ],
    hubs,
    graph: { nodes: graphNodes, edges: [...roadEdges, ...bridge.edges] },
  }
}

export default generateIslandWorld()
