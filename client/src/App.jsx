import { useEffect, useMemo } from 'react'
import { Scene3D } from './scene/Scene3D'
import { AgentsPanel, TasksPanel } from './components/Panels'
import { TaskInput } from './components/TaskInput'
import { ResultsPanel } from './components/ResultsPanel'
import { AgentModal } from './components/AgentModal'
import { WorldSwitcher } from './components/WorldSwitcher'
import { useWebSocket } from './hooks/useWebSocket'
import { useGameStore } from './stores/gameStore'
import { useSettingsStore } from './stores/settingsStore'
import { getWorld } from './worlds/index'
import { checkHealth } from './services/api'
import './styles/global.css'

const FALLBACK_AGENTS = [
  { id: 'eliza-planner', name: 'Eliza', type: 'planner', model_id: 'witch', current_hub: 'planning_room' },
  { id: 'marcus-designer', name: 'Marcus', type: 'designer', model_id: 'black_knight', current_hub: 'design_studio' },
  { id: 'ada-coder', name: 'Ada', type: 'coder', model_id: 'protagonist_a', current_hub: 'coding_desk' },
  { id: 'byron-coder', name: 'Byron', type: 'coder', model_id: 'hiker', current_hub: 'coding_desk' },
  { id: 'clara-reviewer', name: 'Clara', type: 'reviewer', model_id: 'tiefling', current_hub: 'review_station' },
  { id: 'felix-designer', name: 'Felix', type: 'designer', model_id: 'vampire', current_hub: 'design_studio' },
].map((agent) => ({ ...agent, status: 'idle', doing: null, personality: '', capabilities: [] }))

const HEALTH_POLL_MS = 15000

function App() {
  useWebSocket()

  const connected = useGameStore((s) => s.connected)
  const agents = useGameStore((s) => s.agents)
  const setAgents = useGameStore((s) => s.setAgents)
  const setHealth = useGameStore((s) => s.setHealth)
  const selectAgent = useGameStore((s) => s.selectAgent)
  const worldId = useSettingsStore((s) => s.worldId)
  const world = useMemo(() => getWorld(worldId), [worldId])

  useEffect(() => {
    if (!connected && Object.keys(agents).length === 0) {
      setAgents(FALLBACK_AGENTS)
    }
  }, [connected, agents, setAgents])

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const health = await checkHealth()
        if (!cancelled) setHealth(health)
      } catch {
        if (!cancelled) setHealth(null)
      }
    }
    poll()
    const interval = setInterval(poll, HEALTH_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setHealth])

  return (
    <>
      <div className="canvasContainer">
        <Scene3D world={world} onSelectAgent={selectAgent} />
      </div>

      <div className="info">Click agent to inspect | Mouse: Rotate | Scroll: Zoom</div>

      <div className="branding">
        <div className="logo">E</div>
        <div className="text">Powered by <strong>ElizaOS</strong></div>
      </div>

      <WorldSwitcher />

      <div className="uiContainer">
        <AgentsPanel />
        <TasksPanel />
        <ResultsPanel />
        <TaskInput />
      </div>

      <AgentModal />
    </>
  )
}

export default App
