import { Suspense, useMemo, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import { useGameStore, useBubbleStore } from '../stores/gameStore'
import { WorldRenderer } from './WorldRenderer'
import { preloadWorldAssets } from './assetPreload'
import { AgentCharacter } from './AgentCharacter'
import { SceneErrorBoundary } from './ErrorBoundary'

function groupByHub(agents) {
  const sorted = [...agents].sort((a, b) => a.id.localeCompare(b.id))
  const groups = {}
  for (const agent of sorted) {
    const hub = agent.current_hub || 'town_square'
    if (!groups[hub]) groups[hub] = []
    groups[hub].push(agent.id)
  }
  return groups
}

function SceneContents({ world, agents, onSelectAgent }) {
  const hubGroups = useMemo(() => groupByHub(agents), [agents])

  useEffect(() => {
    preloadWorldAssets(world)
  }, [world])

  return (
    <>
      <ambientLight intensity={world.ambient.intensity} color={world.ambient.color} />
      <directionalLight
        position={world.sun.position}
        intensity={world.sun.intensity}
        color={world.sun.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />

      {world.groundColor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color={world.groundColor} roughness={0.9} />
        </mesh>
      )}

      <WorldRenderer world={world} />

      {agents.map((agent) => {
        const slots = hubGroups[agent.current_hub || 'town_square'] || [agent.id]
        return (
          <AgentCharacter
            key={agent.id}
            agent={agent}
            world={world}
            slotIndex={slots.indexOf(agent.id)}
            slotCount={slots.length}
            onSelect={onSelectAgent}
          />
        )
      })}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={140}
        target={world.camera.target}
      />
    </>
  )
}

function LoadingOverlay() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="loading">
      <div className="spinner" />
      <div>Loading Eliza Town... {Math.round(progress)}%</div>
    </div>
  )
}

export function Scene3D({ world, onSelectAgent }) {
  const agents = useGameStore((s) => s.agents)
  const clearExpired = useBubbleStore((s) => s.clearExpired)
  const agentsArray = useMemo(() => Object.values(agents), [agents])

  useEffect(() => {
    const interval = setInterval(clearExpired, 1000)
    return () => clearInterval(interval)
  }, [clearExpired])

  return (
    <>
      <LoadingOverlay />
      <SceneErrorBoundary resetKey={world.id}>
        <Canvas
          key={world.id}
          shadows
          camera={{ position: world.camera.position, fov: 55, near: 0.1, far: 2000 }}
          style={{ background: world.sky }}
        >
          <fog attach="fog" args={[world.fog.color, world.fog.near, world.fog.far]} />
          <Suspense fallback={null}>
            <SceneContents world={world} agents={agentsArray} onSelectAgent={onSelectAgent} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
    </>
  )
}
