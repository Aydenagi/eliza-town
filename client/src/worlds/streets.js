// Shared helpers for laying out a world: facing/door math so a hub sits in
// front of its building's door, and a small shuffle used by scatter helpers.

export const FACING = {
  south: { rotation: 0, dir: [0, 1] },
  north: { rotation: Math.PI, dir: [0, -1] },
  east: { rotation: Math.PI / 2, dir: [1, 0] },
  west: { rotation: -Math.PI / 2, dir: [-1, 0] },
}

export function hubInFrontOf(building, facing, depth, extra = 2.5) {
  const f = FACING[facing]
  const faceDist = depth / 2 + extra
  return { x: building.x + f.dir[0] * faceDist, y: building.y || 0, z: building.z + f.dir[1] * faceDist }
}

export function shuffle(rng, list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
