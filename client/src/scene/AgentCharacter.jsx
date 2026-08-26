import { useRef, useMemo, useLayoutEffect, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Billboard, Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useGameStore, useBubbleStore } from '../stores/gameStore'
import { bfsPath, pathToPositions } from '../worlds/graph'
import { applyIdle, applyWalk, applyWork, applyTalk, blendPoses, overlayPose } from './animator'

const MODEL_FILES = {
  witch: 'Witch',
  black_knight: 'BlackKnight',
  protagonist_a: 'Protagonist_A',
  protagonist_b: 'Protagonist_B',
  hiker: 'Hiker',
  tiefling: 'Tiefling',
  vampire: 'Vampire',
  superhero: 'Superhero',
  caveman: 'Caveman',
  clanker: 'Clanker',
  combat_mech: 'CombatMech',
  frost_golem: 'FrostGolem',
  helper_a: 'Helper_A',
  helper_b: 'Helper_B',
}

const ROLE_FALLBACK = { planner: 'Witch', designer: 'BlackKnight', coder: 'Protagonist_A', reviewer: 'Tiefling' }

const ROLE_COLORS = { planner: '#c084fc', designer: '#f472b6', coder: '#60a5fa', reviewer: '#4ade80' }

const NATIVE_HEIGHT = 2.3
const WALK_BLEND_SECONDS = 0.2
const YAW_SMOOTHING = 8

for (const file of Object.values(MODEL_FILES)) {
  useGLTF.preload(`/assets/models/${file}.glb`)
}

function modelFileFor(agent) {
  return MODEL_FILES[agent.model_id] || ROLE_FALLBACK[agent.type] || 'Protagonist_A'
}

function shortestAngleLerp(current, target, factor) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + diff * factor
}

const HUB_OFFSET_RADIUS = 1.2

function hubOffset(index, count) {
  if (count <= 1) return { dx: 0, dz: 0 }
  const angle = (index / count) * Math.PI * 2
  return { dx: Math.cos(angle) * HUB_OFFSET_RADIUS, dz: Math.sin(angle) * HUB_OFFSET_RADIUS }
}

function buildWalkPlan(world, movement, currentPos, offset) {
  const nodeNames = bfsPath(world.graph, movement.fromHub, movement.targetHub)
  let points
  if (nodeNames) {
    points = pathToPositions(world.graph, nodeNames)
  } else {
    const from = world.hubs[movement.fromHub]
    const to = world.hubs[movement.targetHub]
    points = [from, to].filter(Boolean)
  }
  if (points.length === 0) points = [world.hubs[movement.targetHub]]

  const last = points[points.length - 1]
  points = [currentPos, ...points.slice(1, -1), { x: last.x + offset.dx, y: last.y, z: last.z + offset.dz }]
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1], travelMs: movement.travelMs, startedAt: movement.startedAt }
}

function locateOnPlan(plan, t) {
  const dist = t * plan.total
  let idx = 0
  while (idx < plan.cumulative.length - 2 && plan.cumulative[idx + 1] < dist) idx++
  const a = plan.points[idx]
  const b = plan.points[idx + 1] || a
  const segLen = plan.cumulative[idx + 1] - plan.cumulative[idx]
  const segT = segLen > 0 ? (dist - plan.cumulative[idx]) / segLen : 0
  return {
    x: a.x + (b.x - a.x) * segT,
    y: a.y + (b.y - a.y) * segT,
    z: a.z + (b.z - a.z) * segT,
    dx: b.x - a.x,
    dz: b.z - a.z,
  }
}

export function AgentCharacter({ agent, world, slotIndex, slotCount, onSelect }) {
  const groupRef = useRef(null)
  const posRef = useRef(new THREE.Vector3())
  const yawRef = useRef(0)
  const targetYawRef = useRef(0)
  const walkBlendRef = useRef(0)
  const walkPlanRef = useRef(null)

  const movement = useGameStore((s) => s.movements[agent.id])
  const bubble = useBubbleStore((s) => s.bubbles[agent.id])

  const modelFile = modelFileFor(agent)
  const { scene } = useGLTF(`/assets/models/${modelFile}.glb`)

  const { clone, bones, rest } = useMemo(() => {
    const cloned = skeletonClone(scene)
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    const boneMap = {}
    for (const name of ['root', 'hips', 'spine', 'chest', 'head', 'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
      'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',
      'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r']) {
      const bone = cloned.getObjectByName(name)
      if (bone) boneMap[name] = bone
    }
    const restMap = {}
    for (const [name, bone] of Object.entries(boneMap)) {
      restMap[name] = { rotation: bone.rotation.clone(), position: bone.position.clone() }
    }
    return { clone: cloned, bones: boneMap, rest: restMap }
  }, [scene])

  const offset = useMemo(() => hubOffset(slotIndex, slotCount), [slotIndex, slotCount])

  const hubPosition = (hubName) => {
    const hub = world.hubs[hubName] || world.hubs.town_square
    return { x: hub.x + offset.dx, y: hub.y, z: hub.z + offset.dz }
  }

  useLayoutEffect(() => {
    if (movement) return
    const pos = hubPosition(agent.current_hub)
    posRef.current.set(pos.x, pos.y, pos.z)
    if (groupRef.current) groupRef.current.position.copy(posRef.current)
    walkPlanRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movement, agent.current_hub, offset.dx, offset.dz])

  useEffect(() => {
    if (!movement) return
    walkPlanRef.current = buildWalkPlan(world, movement, { x: posRef.current.x, y: posRef.current.y, z: posRef.current.z }, offset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movement])

  useFrame((state, delta) => {
    const plan = walkPlanRef.current
    const isWalking = !!movement && !!plan

    if (isWalking) {
      const t = Math.min(1, Math.max(0, (Date.now() - plan.startedAt) / plan.travelMs))
      const point = locateOnPlan(plan, t)
      posRef.current.set(point.x, point.y, point.z)
      if (Math.abs(point.dx) > 1e-5 || Math.abs(point.dz) > 1e-5) {
        targetYawRef.current = Math.atan2(point.dx, point.dz)
      }
      walkBlendRef.current = Math.min(1, walkBlendRef.current + delta / WALK_BLEND_SECONDS)
    } else {
      walkBlendRef.current = Math.max(0, walkBlendRef.current - delta / WALK_BLEND_SECONDS)
    }

    yawRef.current = shortestAngleLerp(yawRef.current, targetYawRef.current, 1 - Math.exp(-delta * YAW_SMOOTHING))

    if (groupRef.current) {
      groupRef.current.position.copy(posRef.current)
      groupRef.current.rotation.y = yawRef.current
    }

    const elapsed = state.clock.elapsedTime
    const basePose = agent.status === 'working' ? applyWork(elapsed) : applyIdle(elapsed)
    const walkPose = applyWalk(elapsed)
    let finalPose = blendPoses(basePose, walkPose, walkBlendRef.current)
    if (bubble) finalPose = overlayPose(finalPose, applyTalk(elapsed))

    for (const [name, d] of Object.entries(finalPose.rotations)) {
      const bone = bones[name]
      const restPose = rest[name]
      if (!bone || !restPose) continue
      bone.rotation.x = restPose.rotation.x + (d.x || 0)
      bone.rotation.y = restPose.rotation.y + (d.y || 0)
      bone.rotation.z = restPose.rotation.z + (d.z || 0)
    }
    const rootBone = bones.root
    const rootRest = rest.root
    if (rootBone && rootRest) {
      rootBone.position.y = rootRest.position.y + finalPose.rootBobY
    }
  })

  const characterHeight = NATIVE_HEIGHT * world.characterScale
  const labelY = characterHeight + 0.25
  const bubbleY = labelY + 0.35
  const roleColor = ROLE_COLORS[agent.type] || '#f4e4c1'

  return (
    <group ref={groupRef}>
      <primitive
        object={clone}
        scale={world.characterScale}
        onClick={(e) => { e.stopPropagation(); onSelect(agent.id) }}
        onPointerOver={() => { document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'auto' }}
      />

      <Billboard position={[0, labelY, 0]}>
        <Text fontSize={0.55} color="#f4e4c1" outlineWidth={0.03} outlineColor="#1a1408" anchorX="center" anchorY="middle">
          {agent.name}
        </Text>
      </Billboard>

      {bubble && (
        <Html position={[0, bubbleY, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
          <div style={{
            width: 'max-content',
            maxWidth: '220px',
            padding: '8px 12px',
            background: bubble.type === 'thought' ? 'rgba(40, 30, 20, 0.9)' : 'linear-gradient(180deg, #4a3728, #3d2d1f)',
            border: bubble.type === 'thought' ? '1px solid #6b5a3e' : '2px solid #c9a959',
            borderRadius: bubble.type === 'thought' ? '16px' : '10px',
            color: bubble.type === 'thought' ? '#b8a88a' : '#f4e4c1',
            fontFamily: '"Crimson Text", serif',
            fontSize: bubble.type === 'thought' ? '12px' : '13px',
            fontStyle: bubble.type === 'thought' ? 'italic' : 'normal',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}>
            {bubble.text}
          </div>
        </Html>
      )}

      {agent.status === 'working' && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.65, 32]} />
          <meshBasicMaterial color={roleColor} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}
