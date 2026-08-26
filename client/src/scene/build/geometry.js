import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

export function colorize(geo, color) {
  geo.deleteAttribute('uv')
  if (geo.index) geo = geo.toNonIndexed()
  const c = new THREE.Color(color)
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geo
}

export function coloredBox(w, h, d, color, { x = 0, y = h / 2, z = 0, ry = 0 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d)
  if (ry) geo.rotateY(ry)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

export function coloredCylinder(rTop, rBottom, h, color, { x = 0, y = h / 2, z = 0, segments = 8 } = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

export function coloredCone(r, h, color, { x = 0, y = h / 2, z = 0, segments = 8, ry = 0 } = {}) {
  const geo = new THREE.ConeGeometry(r, h, segments)
  if (ry) geo.rotateY(ry)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

export function coloredSphere(r, color, { x = 0, y = 0, z = 0, widthSegments = 8, heightSegments = 6 } = {}) {
  const geo = new THREE.SphereGeometry(r, widthSegments, heightSegments)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

export function coloredIcosahedron(r, color, { x = 0, y = 0, z = 0, detail = 0 } = {}) {
  const geo = new THREE.IcosahedronGeometry(r, detail)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

// Triangular gable cross-section extruded along x, ridge running along x.
export function gableRoof(w, d, h, color, { x = 0, y = 0, z = 0, overhang = 0.5 } = {}) {
  const halfD = d / 2 + overhang
  const length = w + overhang * 2
  const shape = new THREE.Shape()
  shape.moveTo(-halfD, 0)
  shape.lineTo(halfD, 0)
  shape.lineTo(0, h)
  shape.closePath()
  let geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 })
  geo.translate(0, 0, -length / 2)
  geo.rotateY(Math.PI / 2)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

// Four-sided pyramid scaled to a rectangular footprint, corners over the
// building's corners so the hip faces center on each wall.
export function hipRoof(w, d, h, color, { x = 0, y = 0, z = 0, overhang = 0.5 } = {}) {
  const geo = new THREE.ConeGeometry(1, h, 4)
  geo.rotateY(Math.PI / 4)
  const sx = (w / 2 + overhang) / Math.SQRT1_2
  const sz = (d / 2 + overhang) / Math.SQRT1_2
  geo.scale(sx, 1, sz)
  geo.translate(x, y, z)
  return colorize(geo, color)
}

export function mergeParts(parts) {
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('mergeParts: incompatible geometry attributes')
  return merged
}
