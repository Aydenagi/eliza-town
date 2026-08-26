// Pointy-top hex math for a grid where each tile's native bounds are
// x [-1, 1], z [-1.15, 1.15], y [-1, 0] (top surface at y 0).
// Horizontal spacing is 2*S, row spacing is 1.732*S, odd rows offset by 1*S.
// Using the axial formula below reproduces that exactly and never needs a
// modulo, so negative rows do not shear the field.

const ROW_SPACING = 1.732

export function hexToWorld(q, r, S, y = 0) {
  return {
    x: S * 2 * (q + r / 2),
    y,
    z: S * ROW_SPACING * r,
  }
}

// Yaw that points the road tile's native axis (local X, through the two flat
// edges) from `prev` toward `next`. Consecutive hex-line cells sit at multiples
// of 60 degrees, which is exactly where a straight road can leave a hex.
export function roadRotation(prev, next, S) {
  const a = hexToWorld(prev.q, prev.r, S)
  const b = hexToWorld(next.q, next.r, S)
  return Math.atan2(-(b.z - a.z), b.x - a.x)
}

export function hexKey(q, r) {
  return `${q},${r}`
}

export function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
}

// All axial cells within `radius` of the origin (inclusive).
export function hexFill(radius) {
  const cells = []
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius)
    const rMax = Math.min(radius, -q + radius)
    for (let r = rMin; r <= rMax; r++) {
      cells.push({ q, r })
    }
  }
  return cells
}

// hexFill translated so it is centered on an arbitrary cell instead of the
// origin (axial coordinates translate by plain component addition).
export function hexFillAround(center, radius) {
  return hexFill(radius).map((c) => ({ q: c.q + center.q, r: c.r + center.r }))
}

// Axial cells forming the ring at exactly `radius`.
export function hexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }]
  const dirs = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ]
  const cells = []
  let cell = { q: dirs[4].q * radius, r: dirs[4].r * radius }
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      cells.push(cell)
      cell = { q: cell.q + dirs[side].q, r: cell.r + dirs[side].r }
    }
  }
  return cells
}

function cubeRound(x, y, z) {
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const xDiff = Math.abs(rx - x)
  const yDiff = Math.abs(ry - y)
  const zDiff = Math.abs(rz - z)
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz
  } else if (yDiff > zDiff) {
    ry = -rx - rz
  } else {
    rz = -rx - ry
  }
  return { q: rx, r: rz }
}

// Straight hex line between two axial cells, inclusive of both endpoints.
export function hexLine(a, b) {
  const n = hexDistance(a, b)
  if (n === 0) return [a]
  const ax = a.q, az = a.r, ay = -ax - az
  const bx = b.q, bz = b.r, by = -bx - bz
  const cells = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = ax + (bx - ax) * t
    const y = ay + (by - ay) * t
    const z = az + (bz - az) * t
    cells.push(cubeRound(x, y, z))
  }
  return cells
}

// Deterministic seeded PRNG (mulberry32). Returns a function producing
// numbers in [0, 1).
export function seededRandom(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
