import { hexToWorld, seededRandom } from './hex'
import { buildTileMap, carveRoads, tileMapToArray, scatterProps } from './layout'

const S = 3
const RADIUS = 9
const WALL_HALF = 39
const SEG = 2 * S // 6, matches wall_straight width

const HUB_CELLS = {
  town_square: { q: 0, r: 0 },
  planning_room: { q: -5, r: -1 },
  design_studio: { q: 5, r: -2 },
  coding_desk: { q: -5, r: 3 },
  review_station: { q: 4, r: 3 },
  deploy_station: { q: 0, r: -6 },
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
  ['town_square', 'deploy_station'],
]

function buildHubs() {
  const hubs = {}
  for (const [name, cell] of Object.entries(HUB_CELLS)) {
    const pos = hexToWorld(cell.q, cell.r, S)
    hubs[name] = { ...pos, ...HUB_META[name] }
  }
  return hubs
}

function nearHub(hubs, name, dx, dz) {
  const hub = hubs[name]
  return { x: hub.x + dx, y: 0, z: hub.z + dz }
}

function buildWalls() {
  const props = []
  const segCount = (WALL_HALF * 2) / SEG // 13
  const centers = Array.from({ length: segCount }, (_, i) => -WALL_HALF + SEG * (i + 0.5))

  for (const x of centers) {
    const isGate = Math.abs(x) < 0.01
    props.push({ category: 'buildings', name: isGate ? 'wall_straight_gate' : 'wall_straight', x, y: 0, z: -WALL_HALF, rotation: 0, scale: S })
    props.push({ category: 'buildings', name: isGate ? 'wall_straight_gate' : 'wall_straight', x, y: 0, z: WALL_HALF, rotation: Math.PI, scale: S })
  }
  for (const z of centers) {
    props.push({ category: 'buildings', name: 'wall_straight', x: -WALL_HALF, y: 0, z, rotation: Math.PI / 2, scale: S })
    props.push({ category: 'buildings', name: 'wall_straight', x: WALL_HALF, y: 0, z, rotation: -Math.PI / 2, scale: S })
  }

  const corners = [
    { x: -WALL_HALF, z: -WALL_HALF, rotation: 0 },
    { x: WALL_HALF, z: -WALL_HALF, rotation: Math.PI / 2 },
    { x: WALL_HALF, z: WALL_HALF, rotation: Math.PI },
    { x: -WALL_HALF, z: WALL_HALF, rotation: -Math.PI / 2 },
  ]
  for (const corner of corners) {
    props.push({ category: 'buildings', name: 'wall_corner_A_outside', x: corner.x, y: 0, z: corner.z, rotation: corner.rotation, scale: S })
  }

  return props
}

function buildHubBuildings(hubs) {
  return [
    { category: 'buildings', name: 'building_scaffolding', ...nearHub(hubs, 'town_square', 0, -7), rotation: 0, scale: S * 1.9 },
    { category: 'props', name: 'flag_blue', ...nearHub(hubs, 'town_square', -4, -4), rotation: 0, scale: S },
    { category: 'props', name: 'flag_red', ...nearHub(hubs, 'town_square', 4, -4), rotation: 0, scale: S },
    { category: 'props', name: 'flag_green', ...nearHub(hubs, 'town_square', -4, 4), rotation: 0, scale: S },
    { category: 'props', name: 'flag_yellow', ...nearHub(hubs, 'town_square', 4, 4), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_stage_A', ...nearHub(hubs, 'planning_room', -2, -2), rotation: Math.PI / 4, scale: S * 1.9 },
    { category: 'buildings', name: 'building_stage_B', ...nearHub(hubs, 'planning_room', 3, 2), rotation: Math.PI / 3, scale: S * 1.6 },
    { category: 'props', name: 'barrel', ...nearHub(hubs, 'planning_room', 1, -3), rotation: 0, scale: S },
    { category: 'props', name: 'sack', ...nearHub(hubs, 'planning_room', -3, 1), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_stage_A', ...nearHub(hubs, 'design_studio', 2, -2), rotation: -Math.PI / 4, scale: S * 1.9 },
    { category: 'buildings', name: 'building_stage_C', ...nearHub(hubs, 'design_studio', -3, 2), rotation: -Math.PI / 3, scale: S * 1.7 },
    { category: 'props', name: 'crate_A_big', ...nearHub(hubs, 'design_studio', 3, 1), rotation: 0, scale: S },
    { category: 'props', name: 'tent', ...nearHub(hubs, 'design_studio', -2, -3), rotation: Math.PI / 4, scale: S * 1.7 },

    { category: 'buildings', name: 'building_stage_B', ...nearHub(hubs, 'coding_desk', -2, 2), rotation: Math.PI * 0.75, scale: S * 1.7 },
    { category: 'buildings', name: 'building_stage_C', ...nearHub(hubs, 'coding_desk', 3, -2), rotation: Math.PI * 0.8, scale: S * 1.7 },
    { category: 'props', name: 'wheelbarrow', ...nearHub(hubs, 'coding_desk', 1, 3), rotation: Math.PI / 3, scale: S },
    { category: 'props', name: 'crate_open', ...nearHub(hubs, 'coding_desk', -3, -1), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_stage_A', ...nearHub(hubs, 'review_station', 2, 2), rotation: -Math.PI * 0.75, scale: S * 1.7 },
    { category: 'props', name: 'target', ...nearHub(hubs, 'review_station', -3, -1), rotation: 0, scale: S },
    { category: 'props', name: 'target', ...nearHub(hubs, 'review_station', -3, 2), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_grain', ...nearHub(hubs, 'deploy_station', 0, -2), rotation: 0, scale: S * 1.7 },
    { category: 'props', name: 'resource_lumber', ...nearHub(hubs, 'deploy_station', -3, 1), rotation: 0, scale: S },
    { category: 'props', name: 'resource_stone', ...nearHub(hubs, 'deploy_station', 3, 1), rotation: 0, scale: S },
  ]
}

function generateTownWorld() {
  const rng = seededRandom(1001)
  const hubs = buildHubs()
  const tileMap = buildTileMap(RADIUS, 'hex_grass')
  const { nodes: roadNodes, edges: roadEdges } = carveRoads(tileMap, S, HUB_CELLS, ROAD_CONNECTIONS)

  const allCells = Array.from(tileMap.values())
  const insideCells = allCells.filter((t) => t.type === 'hex_grass' && Math.abs(hexToWorld(t.q, t.r, S).x) < WALL_HALF - 6 && Math.abs(hexToWorld(t.q, t.r, S).z) < WALL_HALF - 6)
  const outsideCells = allCells.filter((t) => t.type === 'hex_grass' && (Math.abs(hexToWorld(t.q, t.r, S).x) > WALL_HALF || Math.abs(hexToWorld(t.q, t.r, S).z) > WALL_HALF))

  const decorations = [
    ...scatterProps(insideCells, rng, { count: 8, category: 'nature', names: ['tree_single_A', 'tree_single_B'], S, scale: [0.9, 1.2] }),
    ...scatterProps(insideCells, rng, { count: 6, category: 'nature', names: ['rock_single_A', 'rock_single_B', 'rock_single_C'], S, scale: [0.7, 1] }),
    ...scatterProps(insideCells, rng, { count: 5, category: 'props', names: ['crate_A_small', 'crate_B_small', 'barrel'], S, scale: [0.8, 1] }),
    ...scatterProps(outsideCells, rng, { count: 14, category: 'nature', names: ['trees_A_medium', 'trees_B_medium', 'trees_A_large'], S, scale: [1, 1.3] }),
    ...scatterProps(outsideCells, rng, { count: 8, category: 'nature', names: ['rock_single_D', 'rock_single_E'], S, scale: [0.8, 1.2] }),
  ]

  const graphNodes = { ...roadNodes }
  for (const [name, hub] of Object.entries(hubs)) {
    graphNodes[name] = { x: hub.x, y: hub.y, z: hub.z }
  }

  return {
    id: 'town',
    name: 'Medieval Town',
    description: 'Walled town on a green plain',
    sky: '#7ec8e3',
    fog: { color: '#7ec8e3', near: 60, far: 220 },
    groundColor: '#4a7c4e',
    ambient: { intensity: 0.5, color: '#fff5e6' },
    sun: { position: [30, 40, 20], intensity: 1.5, color: '#ffffff' },
    scale: S,
    characterScale: 0.7,
    camera: { position: [42, 30, 42], target: [0, 0, 0] },
    tiles: tileMapToArray(tileMap),
    props: [...buildWalls(), ...buildHubBuildings(hubs), ...decorations],
    clouds: [
      { x: -30, y: 32, z: -20, scale: S * 1.4, speed: 0.6 },
      { x: 20, y: 36, z: 25, scale: S * 1.1, speed: 0.4 },
      { x: 0, y: 30, z: -35, scale: S * 0.9, speed: 0.5 },
    ],
    hubs,
    graph: { nodes: graphNodes, edges: roadEdges },
  }
}

export default generateTownWorld()
