import { hexToWorld, hexRing, seededRandom } from './hex'
import { buildTileMap, carveRoads, tileMapToArray, scatterProps } from './layout'

const S = 3
const RADIUS = 9

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

function buildRusticHuts(hubs) {
  return [
    { category: 'buildings', name: 'building_dirt', ...nearHub(hubs, 'town_square', -3, -2), rotation: 0.4, scale: S * 1.7 },
    { category: 'buildings', name: 'projectile_catapult', ...nearHub(hubs, 'town_square', 4, 3), rotation: -0.6, scale: S },

    { category: 'buildings', name: 'building_dirt', ...nearHub(hubs, 'planning_room', -2, -2), rotation: 0.3, scale: S * 1.6 },
    { category: 'props', name: 'barrel', ...nearHub(hubs, 'planning_room', 2, 1), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_grain', ...nearHub(hubs, 'design_studio', 2, -2), rotation: -0.5, scale: S * 1.7 },
    { category: 'props', name: 'crate_long_A', ...nearHub(hubs, 'design_studio', -3, 1), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_destroyed', ...nearHub(hubs, 'coding_desk', -2, 2), rotation: 0.8, scale: S * 1.7 },
    { category: 'props', name: 'weaponrack', ...nearHub(hubs, 'coding_desk', 3, -1), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_dirt', ...nearHub(hubs, 'review_station', 2, 2), rotation: -0.3, scale: S * 1.6 },
    { category: 'props', name: 'target', ...nearHub(hubs, 'review_station', -2, -2), rotation: 0, scale: S },

    { category: 'buildings', name: 'building_grain', ...nearHub(hubs, 'deploy_station', 0, -2), rotation: 0.2, scale: S * 1.7 },
    { category: 'props', name: 'resource_stone', ...nearHub(hubs, 'deploy_station', -3, 0), rotation: 0, scale: S },
  ]
}

function generateHighlandsWorld() {
  const rng = seededRandom(3003)
  const hubs = buildHubs()
  const tileMap = buildTileMap(RADIUS, 'hex_grass')
  const { nodes: roadNodes, edges: roadEdges } = carveRoads(tileMap, S, HUB_CELLS, ROAD_CONNECTIONS)

  const allCells = Array.from(tileMap.values())
  const rimOuter = hexRing(RADIUS).filter((c) => tileMap.get(`${c.q},${c.r}`)?.type === 'hex_grass')
  const rimInner = hexRing(RADIUS - 1).filter((c) => tileMap.get(`${c.q},${c.r}`)?.type === 'hex_grass')
  const interior = allCells.filter((t) => t.type === 'hex_grass')

  const decorations = [
    ...scatterProps(rimOuter, rng, { count: 16, category: 'nature', names: ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'], S, scale: [1, 1.3] }),
    ...scatterProps(rimInner, rng, { count: 12, category: 'nature', names: ['hills_A_trees', 'hills_B_trees', 'hills_C_trees'], S, scale: [0.9, 1.2] }),
    ...scatterProps(interior, rng, { count: 10, category: 'nature', names: ['trees_A_medium', 'trees_B_medium', 'trees_A_small'], S, scale: [0.9, 1.1] }),
    ...scatterProps(interior, rng, { count: 10, category: 'nature', names: ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'], S, scale: [0.7, 1] }),
  ]

  const graphNodes = { ...roadNodes }
  for (const [name, hub] of Object.entries(hubs)) {
    graphNodes[name] = { x: hub.x, y: hub.y, z: hub.z }
  }

  return {
    id: 'highlands',
    name: 'Frostpeak Highlands',
    description: 'Cold rustic settlement ringed by mountains',
    sky: '#c9d6e3',
    fog: { color: '#c9d6e3', near: 55, far: 200 },
    groundColor: '#5a7c5e',
    ambient: { intensity: 0.6, color: '#e6f0ff' },
    sun: { position: [20, 45, -15], intensity: 1.2, color: '#eaf2ff' },
    scale: S,
    characterScale: 0.7,
    camera: { position: [42, 30, 42], target: [0, 0, 0] },
    tiles: tileMapToArray(tileMap),
    props: [...buildRusticHuts(hubs), ...decorations],
    clouds: [
      { x: -20, y: 34, z: 10, scale: S * 1.2, speed: 0.35 },
      { x: 25, y: 38, z: -20, scale: S, speed: 0.3 },
    ],
    hubs,
    graph: { nodes: graphNodes, edges: roadEdges },
  }
}

export default generateHighlandsWorld()
