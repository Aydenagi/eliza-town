import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import styles from '../styles/Panels.module.css'

const TYPE_COLORS = {
  planner: '#c084fc',
  designer: '#f472b6',
  coder: '#60a5fa',
  reviewer: '#4ade80',
}

const HUB_LABELS = {
  town_square: 'Town Square',
  planning_room: 'Planning Room',
  design_studio: 'Design Studio',
  coding_desk: 'Coding Desk',
  review_station: 'Review Station',
  deploy_station: 'Deploy Station',
}

const STAGES = ['queued', 'planning', 'designing', 'coding', 'reviewing', 'completed']

function Panel({ title, badge, status, children }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.panelHeader} onClick={() => setCollapsed(!collapsed)}>
        <span>{title}</span>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
        {status && (
          <span className={`${styles.status} ${status === 'connected' ? styles.connected : styles.disconnected}`}>
            {status === 'connected' ? 'Online' : 'Offline'}
          </span>
        )}
      </div>
      {!collapsed && <div className={styles.panelContent}>{children}</div>}
    </div>
  )
}

export function AgentsPanel() {
  const agents = useGameStore((s) => s.agents)
  const connected = useGameStore((s) => s.connected)
  const selectAgent = useGameStore((s) => s.selectAgent)
  const agentList = Object.values(agents)

  return (
    <Panel title="Agents" status={connected ? 'connected' : 'disconnected'}>
      {agentList.length === 0 ? (
        <div className={styles.placeholder}>Connecting to server...</div>
      ) : (
        <div className={styles.agentList}>
          {agentList.map((agent) => (
            <div key={agent.id} className={styles.agentCard} onClick={() => selectAgent(agent.id)}>
              <div className={styles.agentAvatar} style={{ background: `linear-gradient(135deg, ${TYPE_COLORS[agent.type] || '#667eea'}, #4a5568)` }}>
                {agent.name?.charAt(0) || '?'}
              </div>
              <div className={styles.agentInfo}>
                <div className={styles.agentName}>{agent.name}</div>
                <div className={styles.agentRole}>{agent.type} - {HUB_LABELS[agent.current_hub] || agent.current_hub}</div>
                {agent.doing && <div className={styles.agentDoing}>{agent.doing}</div>}
              </div>
              <div className={`${styles.agentStatus} ${styles[agent.status] || ''}`}>{agent.status || 'idle'}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function TaskPipeline({ task }) {
  if (task.status === 'failed') {
    return <span className={`${styles.pipelineStage} ${styles.failed}`}>failed</span>
  }
  const currentIndex = STAGES.indexOf(task.status)
  return (
    <div className={styles.pipeline}>
      {STAGES.map((stage, i) => (
        <span key={stage} className={`${styles.pipelineStage} ${i === currentIndex ? styles.active : ''} ${i < currentIndex ? styles.done : ''}`}>
          {stage}{stage === 'queued' && task.queuePosition != null && task.status === 'queued' ? ` #${task.queuePosition}` : ''}
        </span>
      ))}
    </div>
  )
}

function TaskItem({ task }) {
  const agents = useGameStore((s) => s.agents)
  const activeSubtask = task.subtasks?.find((st) => st.status === 'in_progress')

  return (
    <div className={`${styles.taskItem} ${styles[task.status] || ''}`}>
      <div className={styles.taskTitleRow}>
        <span className={styles.taskTitle}>{task.title}</span>
        {task.mine && <span className={styles.mineTag}>yours</span>}
      </div>
      <TaskPipeline task={task} />
      {activeSubtask && (
        <div className={styles.taskMeta}>
          {activeSubtask.role}: {activeSubtask.title}
          {activeSubtask.agentId && ` - ${agents[activeSubtask.agentId]?.name || activeSubtask.agentId}`}
        </div>
      )}
      {task.status === 'failed' && task.error && (
        <div className={styles.taskError}>{task.error}</div>
      )}
    </div>
  )
}

export function TasksPanel() {
  const tasks = useGameStore((s) => s.tasks)

  return (
    <Panel title="Tasks" badge={tasks.length}>
      {tasks.length === 0 ? (
        <div className={styles.placeholder}>No tasks yet</div>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((task) => <TaskItem key={task.id} task={task} />)}
        </div>
      )}
    </Panel>
  )
}

export { Panel }
