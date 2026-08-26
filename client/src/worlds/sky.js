import { hexToWorld, hexKey, hexFillAround, hexLine, seededRandom, roadRotation } from './hex'
import { tileMapToArray, scatterProps } from './layout'

const S = 3

const ISLETS = {
  town_square: { center: { q: 0, r: 0 }, radius: 2, y: 8, label: 'Town Square', color: '#c9a959' },
  planning_room: { center: { q: -10, r: -4 }, radius: 1, y: 3, label: 'Planning Room', color: '#c084fc' },
  design_studio: { center: { q: 10, r: -6 }, radius: 1, y: 11, label: 'Design Studio', color: '#f472b6' },
  coding_desk: { center: { q: -10, r: 6 }, radius: 1, y: 5, label: 'Coding Desk', color: '#60a5fa' },
  review_station: { center: { q: 9, r: 4 }, radius: 1, y: 12, label: 'Review Station', color: '#4ade80' },
  deploy_station: { center: { q: 0, r: -14 }, radius: 1, y: 7, label: 'Deploy Station', color: '#fbbf24' },
}

const CAUSEWAYS = [
  ['town_square', 'planning_room'],
  ['town_square', 'design_studio'],
  ['town_square', 'coding_desk'],
  ['town_square', 'review_station'],
  ['town_square', 'deploy_station'],
]

function buildIsletTiles(tileMap) {
  for (const islet of Object.values(ISLETS)) {
    for (const cell of hexFillAround(islet.center, islet.radius)) {
      tileMap.set(hexKey(cell.q, cell.r), { type: 'hex_grass', q: cell.q, r: cell.r, y: islet.y, rotation: 0 })
    }
  }
}

function buildCauseway(tileMap, fromName, toName) {
  const from = ISLETS[fromName]
  const to = ISLETS[toName]
  const line = hexLine(from.center, to.center)
  const nodes = {}
  const edges = []
  let prevName = fromName

  line.forEach((cell, i) => {
    if (i === 0 || i === line.length - 1) return
    const t = i / (line.length - 1)
    const y = from.y + (to.y - from.y) * t
    const rotation = roadRotation(line[i - 1], line[i + 1], S)
    tileMap.set(hexKey(cell.q, cell.r), { type: 'hex_road_A', q: cell.q, r: cell.r, y, rotation })
    const name = `${fromName}__${toName}__${i}`
    nodes[name] = hexToWorld(cell.q, cell.r, S, y)
    edges.push([prevName, name])
    prevName = name
  })
  edges.push([prevName, toName])

  return { nodes, edges }
}

function buildHubs() {
  const hubs = {}
  for (const [name, islet] of Object.entries(ISLETS)) {
    const pos = hexToWorld(islet.center.q, islet.center.r, S, islet.y)
    hubs[name] = { x: pos.x, y: pos.y, z: pos.z, label: islet.label, color: islet.color }
  }
  return hubs
}

function buildIsletDecorations(tileMap, rng) {
  const props = []
  for (const [name, islet] of Object.entries(ISLETS)) {
    const cells = Array.from(hexFillAround(islet.center, islet.radius))
      .map((c) => ({ ...c, y: islet.y }))
    const count = name === 'town_square' ? 3 : 1
    props.push(...scatterProps(cells, rng, {
      count,
      category: 'nature',
      names: ['tree_single_A', 'tree_single_B'],
      S,
      scale: [0.8, 1],
    }).map((p) => ({ ...p, y: p.y + islet.y })))
  }
  return props
}

function buildClouds(rng) {
  const clouds = []
  for (let i = 0; i < 10; i++) {
    clouds.push({
      x: (rng() - 0.5) * 90,
      y: -6 + rng() * 10,
      z: (rng() - 0.5) * 90,
      scale: S * (0.7 + rng() * 0.7),
      speed: 0.3 + rng() * 0.5,
    })
  }
  return clouds
}

function generateSkyWorld() {
  const rng = seededRandom(4004)
  const tileMap = new Map()
  buildIsletTiles(tileMap)

  const graphNodes = {}
  const graphEdges = []
  for (const [fromName, toName] of CAUSEWAYS) {
    const { nodes, edges } = buildCauseway(tileMap, fromName, toName)
    Object.assign(graphNodes, nodes)
    graphEdges.push(...edges)
  }

  const hubs = buildHubs()
  for (const [name, hub] of Object.entries(hubs)) {
    graphNodes[name] = { x: hub.x, y: hub.y, z: hub.z }
  }

  return {
    id: 'sky',
    name: 'Cloudspire',
    description: 'Floating islets linked by elevated causeways',
    sky: '#2b4287',
    fog: { color: '#2b4287', near: 50, far: 200 },
    groundColor: null,
    ambient: { intensity: 0.85, color: '#c8d4ff' },
    sun: { position: [15, 60, 30], intensity: 1.9, color: '#f4f7ff' },
    scale: S,
    characterScale: 0.7,
    camera: { position: [36, 26, 36], target: [0, ISLETS.town_square.y, 0] },
    tiles: tileMapToArray(tileMap),
    props: buildIsletDecorations(tileMap, rng),
    clouds: buildClouds(rng),
    hubs,
    graph: { nodes: graphNodes, edges: graphEdges },
  }
}

export default generateSkyWorld()
