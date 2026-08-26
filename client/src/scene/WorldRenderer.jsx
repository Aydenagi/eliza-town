import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Instances, Instance, Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { hexToWorld } from '../worlds/hex'
import { CLOUD_PATHS } from './assets'
const CLOUD_WRAP = 100

function findMesh(object3d) {
  let found = null
  object3d.traverse((child) => {
    if (!found && child.isMesh) found = child
  })
  return found
}

function TileLayer({ world }) {
  const tileTypes = useMemo(() => Array.from(new Set(world.tiles.map((t) => t.type))), [world])
  const paths = useMemo(() => tileTypes.map((type) => `/assets/town/tiles/${type}.gltf`), [tileTypes])
  const gltfs = useGLTF(paths)

  const byType = useMemo(() => {
    const groups = new Map()
    for (const tile of world.tiles) {
      if (!groups.has(tile.type)) groups.set(tile.type, [])
      groups.get(tile.type).push(tile)
    }
    return groups
  }, [world])

  return (
    <>
      {tileTypes.map((type, i) => {
        const mesh = findMesh(gltfs[i].scene)
        if (!mesh) return null
        const tiles = byType.get(type)
        return (
          <Instances key={type} geometry={mesh.geometry} material={mesh.material} limit={tiles.length} castShadow receiveShadow>
            {tiles.map((tile, idx) => {
              const pos = hexToWorld(tile.q, tile.r, world.scale, tile.y)
              return <Instance key={idx} position={[pos.x, pos.y, pos.z]} rotation={[0, tile.rotation, 0]} scale={world.scale} />
            })}
          </Instances>
        )
      })}
    </>
  )
}

function PropLayer({ world }) {
  const uniqueAssets = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const prop of world.props) {
      const key = `${prop.category}/${prop.name}`
      if (!seen.has(key)) {
        seen.add(key)
        list.push(key)
      }
    }
    return list
  }, [world])
  const paths = useMemo(() => uniqueAssets.map((key) => `/assets/town/${key}.gltf`), [uniqueAssets])
  const gltfs = useGLTF(paths)

  const clones = useMemo(() => {
    const byKey = new Map()
    uniqueAssets.forEach((key, i) => byKey.set(key, gltfs[i]))
    return world.props.map((prop) => {
      const gltf = byKey.get(`${prop.category}/${prop.name}`)
      const object = gltf.scene.clone()
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      return { object, prop }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, gltfs])

  return (
    <>
      {clones.map(({ object, prop }, i) => (
        <primitive key={i} object={object} position={[prop.x, prop.y, prop.z]} rotation={[0, prop.rotation, 0]} scale={prop.scale} />
      ))}
    </>
  )
}

function Cloud({ cloud, gltf }) {
  const ref = useRef(null)
  const xRef = useRef(cloud.x)

  useFrame((_, delta) => {
    xRef.current += cloud.speed * delta * 2
    if (xRef.current > CLOUD_WRAP) xRef.current = -CLOUD_WRAP
    if (ref.current) ref.current.position.x = xRef.current
  })

  const object = useMemo(() => {
    const clonedScene = gltf.scene.clone()
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false
        child.receiveShadow = false
        child.material = child.material.clone()
        child.material.transparent = true
        child.material.opacity = 0.9
      }
    })
    return clonedScene
  }, [gltf])

  return <primitive ref={ref} object={object} position={[cloud.x, cloud.y, cloud.z]} scale={cloud.scale} />
}

function CloudLayer({ world }) {
  const [big, small] = useGLTF(CLOUD_PATHS)
  return (
    <>
      {world.clouds.map((cloud, i) => (
        <Cloud key={i} cloud={cloud} gltf={cloud.scale >= world.scale ? big : small} />
      ))}
    </>
  )
}

function HubMarkers({ world }) {
  return (
    <>
      {Object.entries(world.hubs).map(([name, hub]) => (
        <group key={name} position={[hub.x, hub.y + 0.02, hub.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[world.scale * 0.8, 24]} />
            <meshBasicMaterial color={hub.color} transparent opacity={0.28} side={THREE.DoubleSide} />
          </mesh>
          <Billboard position={[0, 1.4, 0]}>
            <Text fontSize={0.5} color={hub.color} outlineWidth={0.025} outlineColor="#1a1408" anchorX="center" anchorY="middle">
              {hub.label}
            </Text>
          </Billboard>
        </group>
      ))}
    </>
  )
}

export function WorldRenderer({ world }) {
  return (
    <>
      <TileLayer world={world} />
      <PropLayer world={world} />
      <CloudLayer world={world} />
      <HubMarkers world={world} />
    </>
  )
}
