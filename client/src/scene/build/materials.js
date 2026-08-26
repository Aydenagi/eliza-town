import * as THREE from 'three'

export const SOLID = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.85,
  metalness: 0,
})

const glowCache = new Map()

export function GLOW(color) {
  const key = String(color)
  let material = glowCache.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      roughness: 0.4,
      toneMapped: false,
    })
    glowCache.set(key, material)
  }
  return material
}

export function WATER(color) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.75,
    roughness: 0.3,
  })
}
