import * as THREE from 'three'
import {
  coloredBox, coloredCylinder, coloredCone, coloredSphere, coloredIcosahedron,
  gableRoof, hipRoof, mergeParts, colorize, seededRandom,
} from './geometry'
import { SOLID, GLOW, WATER } from './materials'

const cloudMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, transparent: true, opacity: 0.85, roughness: 1,
})

function assemble(parts, glowParts, glowColor) {
  const mesh = new THREE.Mesh(mergeParts(parts), SOLID)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (!glowParts || glowParts.length === 0) return mesh
  const glowMesh = new THREE.Mesh(mergeParts(glowParts), GLOW(glowColor))
  const group = new THREE.Group()
  group.add(mesh, glowMesh)
  return group
}

function orientedSegment(a, b, thickness, color) {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z)
  const len = dir.length() || 0.001
  const geo = new THREE.CylinderGeometry(thickness, thickness, len, 5)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  geo.applyQuaternion(quat)
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return colorize(geo, color)
}

export function house({
  w = 6, d = 6, floors = 1, roof = 'gable', wall = '#d8c9a3', trim = '#7a5c3e',
  roofColor = '#8b3a3a', windows = true, door = true, chimney = false, glow = false, timber = false,
} = {}) {
  const floorH = 3
  const h = floors * floorH
  const parts = [coloredBox(w, h, d, wall)]
  const glowParts = []

  if (timber) {
    const beamW = 0.15
    for (let fx = -w / 2 + 0.9; fx <= w / 2 - 0.6; fx += 1.5) {
      parts.push(coloredBox(beamW, h, beamW, trim, { x: fx, z: d / 2 + 0.02 }))
    }
    parts.push(coloredBox(w, beamW, beamW, trim, { y: h - 0.08, z: d / 2 + 0.02 }))
    parts.push(coloredBox(w, beamW, beamW, trim, { y: 0.08, z: d / 2 + 0.02 }))
  }

  if (door) {
    parts.push(coloredBox(1.2, 2.4, 0.12, '#3d2b1f', { y: 1.2, z: d / 2 + 0.03 }))
  }

  if (windows) {
    const winColor = glow ? '#ffd27a' : '#bcd9e8'
    const target = glow ? glowParts : parts
    for (let f = 0; f < floors; f++) {
      const wy = f * floorH + floorH / 2 + 0.2
      const xs = f === 0 && door ? [-w / 3, w / 3] : [-w / 3, 0, w / 3]
      for (const wx of xs) {
        if (Math.abs(wx) > w / 2 - 0.8) continue
        target.push(coloredBox(1.2, 1.4, 0.1, winColor, { x: wx, y: wy, z: d / 2 + 0.03 }))
      }
      target.push(coloredBox(1.2, 1.4, 0.1, winColor, { y: wy, z: -d / 2 - 0.03 }))
    }
  }

  if (chimney) {
    parts.push(coloredBox(0.7, floorH, 0.7, trim, { x: w / 3, y: h + floorH / 2, z: -d / 4 }))
  }

  if (roof === 'gable') parts.push(gableRoof(w, d, floorH * 0.9, roofColor, { y: h }))
  else if (roof === 'hip') parts.push(hipRoof(w, d, floorH * 0.8, roofColor, { y: h }))
  else if (roof === 'cone') parts.push(coloredCone(Math.max(w, d) / 2 + 0.4, floorH * 1.1, roofColor, { y: h, segments: 12 }))
  else parts.push(coloredBox(w + 0.6, 0.3, d + 0.6, roofColor, { y: h + 0.15 }))

  return assemble(parts, glowParts, '#ffd27a')
}

export function tower({ radius = 2.2, height = 12, color = '#9c9384', roofColor = '#7a2f2f', roof = 'cone', windows = true, glow = false } = {}) {
  const parts = [coloredCylinder(radius, radius, height, color, { segments: 12 })]
  const glowParts = []
  if (windows) {
    const rows = Math.max(1, Math.floor(height / 3))
    const target = glow ? glowParts : parts
    for (let f = 0; f < rows; f++) {
      const wy = f * 3 + 1.8
      for (let a = 0; a < 4; a++) {
        const angle = (a * Math.PI) / 2
        target.push(coloredBox(0.8, 1.1, 0.1, glow ? '#ffd27a' : '#bcd9e8', {
          x: Math.sin(angle) * (radius + 0.03), y: wy, z: Math.cos(angle) * (radius + 0.03), ry: angle,
        }))
      }
    }
  }
  if (roof === 'cone') {
    parts.push(coloredCone(radius + 0.3, 4, roofColor, { y: height, segments: 12 }))
  } else if (roof === 'crenel') {
    parts.push(coloredCylinder(radius + 0.15, radius + 0.15, 0.6, roofColor, { y: height + 0.3, segments: 12 }))
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      parts.push(coloredBox(0.5, 0.6, 0.5, roofColor, { x: Math.sin(angle) * radius, y: height + 0.9, z: Math.cos(angle) * radius }))
    }
  } else {
    parts.push(coloredCylinder(radius + 0.1, radius + 0.1, 0.3, roofColor, { y: height + 0.15, segments: 12 }))
  }
  return assemble(parts, glowParts, '#ffd27a')
}

export function wallRun({ length = 8, height = 4, thickness = 1, color = '#8a8378', crenel = true } = {}) {
  const parts = [coloredBox(length, height, thickness, color)]
  if (crenel) {
    const count = Math.max(2, Math.round(length / 1.4))
    const step = length / count
    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) continue
      parts.push(coloredBox(step * 0.8, 0.6, thickness, color, { x: -length / 2 + step * (i + 0.5), y: height + 0.3 }))
    }
  }
  return assemble(parts)
}

export function gate({ width = 6, height = 6, depth = 2, color = '#8a8378' } = {}) {
  const pierW = 1.2
  const parts = [
    coloredBox(pierW, height, depth, color, { x: -width / 2 + pierW / 2 }),
    coloredBox(pierW, height, depth, color, { x: width / 2 - pierW / 2 }),
    coloredBox(width, height * 0.3, depth, color, { y: height - height * 0.15 }),
  ]
  return assemble(parts)
}

export function fountain({ radius = 2.5 } = {}) {
  const basinTop = 0.5
  const parts = [
    coloredCylinder(radius, radius, 0.5, '#9c9384', { segments: 16 }),
    coloredCylinder(radius - 0.3, radius - 0.3, 0.4, '#9c9384', { y: basinTop + 0.2, segments: 16 }),
    coloredCylinder(0.4, 0.5, 1.2, '#9c9384', { y: basinTop + 0.6, segments: 8 }),
  ]
  const mesh = assemble(parts)
  const waterGeo = new THREE.CircleGeometry(radius - 0.35, 16)
  waterGeo.rotateX(-Math.PI / 2)
  waterGeo.translate(0, basinTop + 0.05, 0)
  const water = new THREE.Mesh(waterGeo, WATER('#6fb8c9'))
  water.receiveShadow = true
  const group = new THREE.Group()
  group.add(mesh, water)
  return group
}

export function marketStall({ color = '#b23b3b' } = {}) {
  const postH = 2.2
  const parts = [
    coloredBox(0.15, postH, 0.15, '#6b5138', { x: -1.2, z: -0.9 }),
    coloredBox(0.15, postH, 0.15, '#6b5138', { x: 1.2, z: -0.9 }),
    coloredBox(0.15, postH, 0.15, '#6b5138', { x: -1.2, z: 0.9 }),
    coloredBox(0.15, postH, 0.15, '#6b5138', { x: 1.2, z: 0.9 }),
    coloredBox(2.6, 0.9, 1.9, '#8a6a45', { y: 0.5 }),
  ]
  const stripe = '#f0e6d2'
  for (let i = 0; i < 6; i++) {
    parts.push(coloredBox(0.5, 0.1, 2.2, i % 2 === 0 ? color : stripe, { x: -1.3 + i * 0.52, y: postH }))
  }
  return assemble(parts)
}

export function tree({ height = 4, variant = 'round', trunk = '#5c4530', leaves = '#4f7a3d' } = {}) {
  const trunkH = variant === 'palm' ? height * 0.8 : height * 0.4
  const parts = [coloredCylinder(0.25, 0.3, trunkH, trunk, { segments: 6 })]
  if (variant === 'round') {
    parts.push(coloredIcosahedron(height * 0.45, leaves, { y: trunkH + height * 0.3 }))
  } else if (variant === 'pine') {
    parts.push(coloredCone(height * 0.35, height * 0.55, leaves, { y: trunkH + height * 0.25, segments: 8 }))
    parts.push(coloredCone(height * 0.26, height * 0.4, leaves, { y: trunkH + height * 0.55, segments: 8 }))
  } else if (variant === 'palm') {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      parts.push(coloredBox(0.25, 1.6, 0.6, leaves, {
        x: Math.sin(angle) * 0.6, y: trunkH + 0.3, z: Math.cos(angle) * 0.6, ry: angle,
      }))
    }
  }
  return assemble(parts)
}

export function lampPost({ height = 3.2, lit = true } = {}) {
  const parts = [
    coloredCylinder(0.08, 0.1, height, '#3a3a3a', { segments: 6 }),
    coloredBox(0.35, 0.35, 0.35, '#3a3a3a', { y: height }),
  ]
  const mesh = assemble(parts)
  if (!lit) return mesh
  const lampGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25)
  lampGeo.translate(0, height + 0.05, 0)
  const lamp = new THREE.Mesh(lampGeo, GLOW('#ffd27a'))
  const group = new THREE.Group()
  group.add(mesh, lamp)
  return group
}

export function bench() {
  const parts = [
    coloredBox(1.6, 0.1, 0.5, '#6b5138', { y: 0.45 }),
    coloredBox(1.6, 0.4, 0.08, '#6b5138', { y: 0.75, z: -0.2 }),
    coloredBox(0.1, 0.45, 0.5, '#3a3a3a', { x: -0.7 }),
    coloredBox(0.1, 0.45, 0.5, '#3a3a3a', { x: 0.7 }),
  ]
  return assemble(parts)
}

export function crate({ size = 0.8, color = '#a0784a' } = {}) {
  return assemble([coloredBox(size, size, size, color)])
}

export function barrel({ radius = 0.4, height = 0.9, color = '#7a5230' } = {}) {
  return assemble([coloredCylinder(radius, radius * 0.9, height, color, { segments: 10 })])
}

export function flagPole({ height = 5, color = '#c0392b' } = {}) {
  const parts = [
    coloredCylinder(0.06, 0.08, height, '#8a8378', { segments: 6 }),
    coloredBox(1, 0.6, 0.05, color, { x: 0.5, y: height - 0.4 }),
  ]
  return assemble(parts)
}

export function pier({ length = 10, width = 3, height = 1.2 } = {}) {
  const parts = [coloredBox(width, 0.2, length, '#7a5c3e', { y: height })]
  const postCount = Math.max(2, Math.round(length / 2.5))
  for (let i = 0; i < postCount; i++) {
    const zp = -length / 2 + 0.6 + i * ((length - 1.2) / (postCount - 1))
    parts.push(coloredCylinder(0.12, 0.14, height, '#5c4530', { x: -width / 2 + 0.2, y: height / 2, z: zp, segments: 6 }))
    parts.push(coloredCylinder(0.12, 0.14, height, '#5c4530', { x: width / 2 - 0.2, y: height / 2, z: zp, segments: 6 }))
  }
  return assemble(parts)
}

export function boat({ length = 5, hull = '#7a4a2f', sail = true } = {}) {
  const halfL = length / 2
  const halfBeam = length * 0.18
  const hullH = length * 0.14
  const shape = new THREE.Shape()
  shape.moveTo(-halfL, 0)
  shape.lineTo(-halfL * 0.5, halfBeam)
  shape.lineTo(halfL * 0.6, halfBeam)
  shape.lineTo(halfL, 0)
  shape.lineTo(halfL * 0.6, -halfBeam)
  shape.lineTo(-halfL * 0.5, -halfBeam)
  shape.closePath()
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: hullH, bevelEnabled: false, curveSegments: 1 })
  hullGeo.rotateX(-Math.PI / 2)
  const parts = [colorize(hullGeo, hull)]

  const mastH = sail ? length * 0.7 : length * 0.2
  parts.push(coloredCylinder(0.05, 0.06, mastH, '#5c4530', { y: hullH + mastH / 2 }))

  if (sail) {
    const sailShape = new THREE.Shape()
    sailShape.moveTo(0, 0)
    sailShape.lineTo(0, mastH * 0.8)
    sailShape.lineTo(halfL * 0.55, mastH * 0.25)
    sailShape.closePath()
    const sailGeo = new THREE.ExtrudeGeometry(sailShape, { depth: 0.03, bevelEnabled: false, curveSegments: 1 })
    sailGeo.translate(0, hullH, -0.015)
    parts.push(colorize(sailGeo, '#f0e6d2'))
  }

  return assemble(parts)
}

export function lighthouse({ height = 14 } = {}) {
  const shaftH = height * 0.85
  const parts = [coloredCylinder(1.6, 2.1, shaftH, '#e8e2d0', { segments: 12 })]
  const bandCount = 3
  for (let i = 1; i <= bandCount; i++) {
    parts.push(coloredCylinder(1.65, 1.65, shaftH / (bandCount * 2), '#b23b3b', { y: (shaftH / (bandCount + 1)) * i, segments: 12 }))
  }
  const galleryY = shaftH
  parts.push(coloredCylinder(1.9, 1.7, 0.4, '#8a8378', { y: galleryY, segments: 12 }))
  const roomH = height * 0.12
  parts.push(coloredCylinder(1.1, 1.1, roomH, '#3a3a3a', { y: galleryY + 0.4 + roomH / 2, segments: 10 }))
  parts.push(coloredCone(1.3, height * 0.08, '#3a3a3a', { y: galleryY + 0.4 + roomH + height * 0.04, segments: 10 }))
  const glowParts = [coloredCylinder(0.7, 0.7, roomH * 0.7, '#fff2c0', { y: galleryY + 0.4 + roomH / 2, segments: 10 })]
  return assemble(parts, glowParts, '#fff2c0')
}

export function warehouse({ w = 10, d = 16, h = 6, color = '#8a7a63' } = {}) {
  const parts = [
    coloredBox(w, h, d, color),
    coloredBox(w * 0.5, 3.2, 0.15, '#4a3a28', { y: 1.6, z: d / 2 + 0.02 }),
    gableRoof(w, d, 2.2, '#5a4a38', { y: h, overhang: 0.6 }),
  ]
  return assemble(parts)
}

export function skyscraper({ w = 10, d = 10, h = 30, color = '#3a4048', windowRows = 10, windowCols = 4, glow = true } = {}) {
  const parts = [coloredBox(w, h, d, color), coloredBox(w * 0.7, 0.6, d * 0.7, '#3a5a3a', { y: h + 0.3 })]
  if (h > 40) parts.push(coloredCylinder(0.08, 0.12, h * 0.15, '#1a1a1a', { y: h + h * 0.075, segments: 6 }))

  const glowParts = []
  const rowH = Math.min(2.4, (h - 1) / windowRows)
  const colSpacingX = w / (windowCols + 1)
  const colSpacingZ = d / (windowCols + 1)
  for (let r = 0; r < windowRows; r++) {
    const wy = 1 + r * rowH
    if (wy > h - 1) break
    for (let c = 1; c <= windowCols; c++) {
      glowParts.push(coloredBox(0.7, rowH * 0.6, 0.08, '#ffe9a8', { x: -w / 2 + colSpacingX * c, y: wy, z: d / 2 + 0.03 }))
      glowParts.push(coloredBox(0.7, rowH * 0.6, 0.08, '#ffe9a8', { x: -w / 2 + colSpacingX * c, y: wy, z: -d / 2 - 0.03 }))
      glowParts.push(coloredBox(0.08, rowH * 0.6, 0.7, '#ffe9a8', { x: w / 2 + 0.03, y: wy, z: -d / 2 + colSpacingZ * c }))
      glowParts.push(coloredBox(0.08, rowH * 0.6, 0.7, '#ffe9a8', { x: -w / 2 - 0.03, y: wy, z: -d / 2 + colSpacingZ * c }))
    }
  }
  return assemble(parts, glow ? glowParts : [], '#ffe9a8')
}

export function platform({ radius = 10, thickness = 2, top = '#5c8a5c', rock = '#5a5248' } = {}) {
  const parts = [coloredCylinder(radius, radius, 0.6, top, { y: -0.3, segments: 16 })]
  const rng = seededRandom(Math.round(radius * 97) + 1)
  const coneGeo = new THREE.ConeGeometry(radius * 0.9, thickness, 12, 4)
  const pos = coneGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > -thickness * 0.4) continue
    const jitter = 1 + (rng() - 0.5) * 0.3
    pos.setX(i, pos.getX(i) * jitter)
    pos.setZ(i, pos.getZ(i) * jitter)
  }
  coneGeo.computeVertexNormals()
  coneGeo.translate(0, -0.6 - thickness / 2, 0)
  parts.push(colorize(coneGeo, rock))
  return assemble(parts)
}

function ropePoint(t, length, width, side) {
  return { x: (side * width) / 2, y: Math.sin(t * Math.PI) * -0.4 + 0.9, z: -length / 2 + t * length }
}

export function ropeBridge({ length = 10, width = 2 } = {}) {
  const parts = []
  const plankCount = Math.max(4, Math.round(length / 0.8))
  for (let i = 0; i < plankCount; i++) {
    const t = (i + 0.5) / plankCount
    parts.push(coloredBox(width, 0.1, 0.5, '#7a5c3e', { y: Math.sin(t * Math.PI) * -0.4, z: -length / 2 + t * length }))
  }
  const postSteps = 6
  for (let i = 0; i <= postSteps; i++) {
    const t = i / postSteps
    const deckY = Math.sin(t * Math.PI) * -0.4
    const z = -length / 2 + t * length
    for (const side of [-1, 1]) {
      parts.push(orientedSegment({ x: (side * width) / 2, y: deckY, z }, { x: (side * width) / 2, y: deckY + 0.8, z }, 0.05, '#4a3a28'))
      if (i > 0) {
        const a = ropePoint((i - 1) / postSteps, length, width, side)
        const b = ropePoint(t, length, width, side)
        parts.push(orientedSegment(a, b, 0.04, '#4a3a28'))
      }
    }
  }
  return assemble(parts)
}

export function airship({ length = 8, color = '#c9a959' } = {}) {
  const balloon = new THREE.SphereGeometry(1, 10, 8)
  balloon.scale(length / 2, length * 0.28, length * 0.28)
  const parts = [
    colorize(balloon, color),
    coloredBox(length * 0.25, length * 0.12, length * 0.12, '#4a3a28', { y: -length * 0.22 }),
  ]
  for (const side of [-1, 1]) {
    parts.push(coloredBox(0.06, length * 0.18, length * 0.18, '#8a6a45', {
      x: side * length * 0.02, y: 0, z: -length * 0.42, ry: Math.PI / 4,
    }))
  }
  return assemble(parts)
}

export function cloud({ scale = 1 } = {}) {
  const rng = seededRandom(Math.round(scale * 733) + 1)
  const count = 3 + Math.floor(rng() * 3)
  const parts = []
  for (let i = 0; i < count; i++) {
    const r = (0.6 + rng() * 0.5) * scale
    parts.push(coloredSphere(r, '#ffffff', {
      x: (rng() - 0.5) * 1.6 * scale, y: (rng() - 0.5) * 0.4 * scale, z: (rng() - 0.5) * 1.6 * scale,
      widthSegments: 7, heightSegments: 6,
    }))
  }
  const mesh = new THREE.Mesh(mergeParts(parts), cloudMaterial)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

export function rock({ radius = 1, color = '#7a7568' } = {}) {
  const rng = seededRandom(Math.round(radius * 1301) + 1)
  const geo = new THREE.IcosahedronGeometry(radius, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const jitter = 1 + (rng() - 0.5) * 0.35
    pos.setXYZ(i, pos.getX(i) * jitter, pos.getY(i) * jitter * 0.8, pos.getZ(i) * jitter)
  }
  geo.computeVertexNormals()
  geo.translate(0, radius * 0.4, 0)
  return assemble([colorize(geo, color)])
}

function windmillBlade(length, color) {
  const geo = new THREE.BoxGeometry(0.25, length, 0.08)
  geo.translate(0, length / 2, 0)
  return colorize(geo, color)
}

export function windmill({ towerHeight = 8, radius = 1.6, bladeLength = 3.2, color = '#c9b28a', capColor = '#5a4a38' } = {}) {
  const towerMesh = assemble([
    coloredCylinder(radius, radius * 1.3, towerHeight, color, { segments: 10 }),
    coloredCone(radius * 1.1, towerHeight * 0.25, capColor, { y: towerHeight, segments: 10 }),
  ])

  const bladeParts = [0, 1, 2, 3].map((i) => {
    const geo = windmillBlade(bladeLength, '#e8e2d0')
    geo.rotateZ((i / 4) * Math.PI * 2)
    return geo
  })
  const sails = new THREE.Mesh(mergeParts(bladeParts), SOLID)
  sails.castShadow = true
  sails.position.set(0, towerHeight * 0.8, radius + 0.15)

  const group = new THREE.Group()
  group.add(towerMesh, sails)
  group.userData.spinTarget = sails
  return group
}

export function dome({ radius = 4, baseHeight = 3, color = '#8a97a8', glassColor = '#bcd9e8' } = {}) {
  const domeGeo = new THREE.SphereGeometry(radius * 0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  domeGeo.translate(0, baseHeight, 0)
  const parts = [
    coloredCylinder(radius, radius * 1.1, baseHeight, color, { segments: 12 }),
    colorize(domeGeo, glassColor),
  ]
  return assemble(parts)
}

export function gantry({ height = 20, spread = 3, color = '#8a8378' } = {}) {
  const legOffsets = [[-spread, -spread], [spread, -spread], [-spread, spread], [spread, spread]]
  const parts = legOffsets.map(([x, z]) => coloredBox(0.35, height, 0.35, color, { x, z }))
  const rungCount = 6
  for (let i = 1; i <= rungCount; i++) {
    const y = (height / rungCount) * i
    parts.push(coloredBox(spread * 2, 0.15, 0.15, color, { y, z: -spread }))
    parts.push(coloredBox(spread * 2, 0.15, 0.15, color, { y, z: spread }))
    parts.push(coloredBox(0.15, 0.15, spread * 2, color, { x: -spread, y }))
    parts.push(coloredBox(0.15, 0.15, spread * 2, color, { x: spread, y }))
  }
  return assemble(parts)
}

export function dish({ height = 6, radius = 1.6, color = '#d4d4d4' } = {}) {
  const parts = [
    coloredCylinder(0.3, 0.4, height, '#5a5a5a', { segments: 8 }),
    coloredCylinder(radius, radius * 0.3, 0.5, color, { y: height, segments: 12 }),
  ]
  return assemble(parts)
}

export function mountain({ radius = 12, height = 20, color = '#6b6b5c', snow = true } = {}) {
  const parts = [coloredCone(radius, height, color, { segments: 8 })]
  if (snow) parts.push(coloredCone(radius * 0.35, height * 0.3, '#f2f2f2', { y: height * 0.85, segments: 8 }))
  return assemble(parts)
}
