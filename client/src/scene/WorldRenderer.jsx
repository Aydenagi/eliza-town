import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import * as structures from './build/structures'
import { cloud } from './build/structures'

const CLOUD_WRAP = 100
const SPIN_SPEED = 0.6
const BOB_SPEED = 0.8
const BOB_AMOUNT = 0.3

function buildStructure(def) {
  const builder = structures[def.kind]
  if (!builder) return null
  const object = builder(def.params || {})
  object.position.set(def.x, def.y || 0, def.z)
  if (def.rotation) object.rotation.y = def.rotation
  return object
}

function Ground({ world }) {
  if (!world.ground) return null
  const { size, color, x = 0, z = 0 } = world.ground
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.05, z]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  )
}

function Water({ world }) {
  if (!world.water) return null
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, world.water.level, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color={world.water.color} roughness={0.3} />
    </mesh>
  )
}

function Plazas({ world }) {
  return (
    <>
      {(world.plazas || []).map((p, i) => (
        <mesh key={i} position={[p.x, 0.02, p.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[p.radius, 24]} />
          <meshStandardMaterial color={p.color} roughness={0.95} />
        </mesh>
      ))}
    </>
  )
}

function Roads({ world }) {
  if (!world.roadColor) return null
  return (
    <group>
      {world.graph.edges.map(([a, b], i) => {
        const pa = world.graph.nodes[a]
        const pb = world.graph.nodes[b]
        if (!pa || !pb) return null
        const dx = pb.x - pa.x
        const dz = pb.z - pa.z
        const length = Math.hypot(dx, dz)
        const angle = Math.atan2(dx, dz)
        return (
          <mesh
            key={i}
            position={[(pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + 0.03, (pa.z + pb.z) / 2]}
            rotation={[0, angle, 0]}
            receiveShadow
          >
            <boxGeometry args={[world.roadWidth, 0.06, length]} />
            <meshStandardMaterial color={world.roadColor} roughness={0.95} />
          </mesh>
        )
      })}
      {Object.entries(world.graph.nodes).map(([name, pos]) => (
        <mesh key={name} position={[pos.x, pos.y + 0.03, pos.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[world.roadWidth / 2, 12]} />
          <meshStandardMaterial color={world.roadColor} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

function SpinningStructure({ def }) {
  const object = useMemo(() => buildStructure(def), [def])
  const rootRef = useRef(null)

  useFrame((_, delta) => {
    const sails = rootRef.current?.userData.spinTarget
    if (sails) sails.rotation.z += delta * SPIN_SPEED
  })

  return <primitive ref={rootRef} object={object} />
}

function BobbingStructure({ def }) {
  const object = useMemo(() => buildStructure(def), [def])
  const rootRef = useRef(null)
  const baseY = def.y || 0

  useFrame((state) => {
    if (rootRef.current) rootRef.current.position.y = baseY + Math.sin(state.clock.elapsedTime * BOB_SPEED) * BOB_AMOUNT
  })

  return <primitive ref={rootRef} object={object} />
}

function StructureLayer({ world }) {
  const objects = useMemo(
    () => world.structures.filter((def) => def.kind !== 'windmill' && def.kind !== 'airship').map(buildStructure).filter(Boolean),
    [world],
  )
  const animated = useMemo(
    () => world.structures.filter((def) => def.kind === 'windmill' || def.kind === 'airship'),
    [world],
  )

  return (
    <>
      {objects.map((object, i) => <primitive key={i} object={object} />)}
      {animated.map((def, i) => (
        def.kind === 'windmill'
          ? <SpinningStructure key={`spin-${i}`} def={def} />
          : <BobbingStructure key={`bob-${i}`} def={def} />
      ))}
    </>
  )
}

function CloudItem({ def }) {
  const ref = useRef(null)
  const xRef = useRef(def.x)
  const object = useMemo(() => cloud({ scale: def.scale }), [def.scale])

  useFrame((_, delta) => {
    xRef.current += def.speed * delta * 2
    if (xRef.current > CLOUD_WRAP) xRef.current = -CLOUD_WRAP
    if (ref.current) ref.current.position.set(xRef.current, def.y, def.z)
  })

  return <primitive ref={ref} object={object} position={[def.x, def.y, def.z]} />
}

function CloudLayer({ world }) {
  return (
    <>
      {world.clouds.map((c, i) => <CloudItem key={i} def={c} />)}
    </>
  )
}

function HubMarkers({ world }) {
  return (
    <>
      {Object.entries(world.hubs).map(([name, hub]) => (
        <group key={name} position={[hub.x, hub.y + 0.03, hub.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.6, 2, 32]} />
            <meshBasicMaterial color={hub.color} transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
          <Billboard position={[0, 4, 0]}>
            <Text fontSize={0.55} color={hub.color} outlineWidth={0.03} outlineColor="#1a1408" anchorX="center" anchorY="middle">
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
      <Ground world={world} />
      <Water world={world} />
      <Plazas world={world} />
      <Roads world={world} />
      <StructureLayer world={world} />
      <CloudLayer world={world} />
      <HubMarkers world={world} />
    </>
  )
}
