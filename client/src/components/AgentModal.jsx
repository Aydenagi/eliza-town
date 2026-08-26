import { useState, useEffect } from 'react'
import { useGameStore } from '../stores/gameStore'
import { updateAgent } from '../services/api'
import styles from '../styles/AgentModal.module.css'

const HUB_LABELS = {
  town_square: 'Town Square',
  planning_room: 'Planning Room',
  design_studio: 'Design Studio',
  coding_desk: 'Coding Desk',
  review_station: 'Review Station',
  deploy_station: 'Deploy Station',
}

export function AgentModal() {
  const selectedAgentId = useGameStore((s) => s.selectedAgentId)
  const agent = useGameStore((s) => (selectedAgentId ? s.agents[selectedAgentId] : null))
  const clearSelectedAgent = useGameStore((s) => s.clearSelectedAgent)
  const patchAgent = useGameStore((s) => s.patchAgent)

  const [activeTab, setActiveTab] = useState('info')
  const [editName, setEditName] = useState('')
  const [editPersonality, setEditPersonality] = useState('')
  const [editCapabilities, setEditCapabilities] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState(null)

  useEffect(() => {
    if (agent) {
      setEditName(agent.name || '')
      setEditPersonality(agent.personality || '')
      setEditCapabilities((agent.capabilities || []).join(', '))
      setActiveTab('info')
      setSaveState(null)
    }
    // Only reset edit fields when the selected agent changes, not on every
    // store update to the same agent (e.g. a status tick while the modal
    // is open would otherwise clobber in-progress edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id])

  if (!agent) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) clearSelectedAgent()
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveState(null)
    try {
      const updates = {
        name: editName,
        personality: editPersonality,
        capabilities: editCapabilities.split(',').map((c) => c.trim()).filter(Boolean),
      }
      const updated = await updateAgent(agent.id, updates)
      patchAgent(agent.id, updated)
      setSaveState({ type: 'success', text: 'Saved' })
    } catch (e) {
      setSaveState({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{agent.name}</h2>
          <button className={styles.closeButton} onClick={clearSelectedAgent}>&times;</button>
        </div>

        <div className={styles.body}>
          <div className={styles.characterSection}>
            <div className={styles.characterPreview}>
              <div className={styles.placeholder}>{agent.name?.charAt(0) || '?'}</div>
            </div>
            <div className={styles.nameBadge}>{agent.name}</div>
            <div className={styles.role}>{agent.type?.toUpperCase()}</div>
          </div>

          <div className={styles.detailsSection}>
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${activeTab === 'info' ? styles.active : ''}`} onClick={() => setActiveTab('info')}>Info</button>
              <button className={`${styles.tab} ${activeTab === 'customize' ? styles.active : ''}`} onClick={() => setActiveTab('customize')}>Customize</button>
            </div>

            <div className={styles.tabContent}>
              {activeTab === 'info' && (
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Status</div>
                    <div className={styles.infoValue}>{agent.status || 'idle'}</div>
                  </div>
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Location</div>
                    <div className={styles.infoValue}>{HUB_LABELS[agent.current_hub] || agent.current_hub}</div>
                  </div>
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Current Task</div>
                    <div className={styles.infoValue}>{agent.doing || 'None'}</div>
                  </div>
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Model</div>
                    <div className={styles.infoValue}>{agent.model_id || 'default'}</div>
                  </div>
                  <div className={`${styles.infoItem} ${styles.full}`}>
                    <div className={styles.infoLabel}>Personality</div>
                    <div className={styles.infoValue}>{agent.personality || 'No personality set'}</div>
                  </div>
                  <div className={`${styles.infoItem} ${styles.full}`}>
                    <div className={styles.infoLabel}>Capabilities</div>
                    <div className={styles.capabilities}>
                      {(agent.capabilities || []).map((cap) => (
                        <span key={cap} className={styles.capabilityTag}>{cap}</span>
                      ))}
                      {(!agent.capabilities || agent.capabilities.length === 0) && (
                        <span className={styles.noCapabilities}>No capabilities set</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'customize' && (
                <div className={styles.customizeForm}>
                  <div className={styles.formGroup}>
                    <label>Agent Name</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Personality</label>
                    <textarea
                      value={editPersonality}
                      onChange={(e) => setEditPersonality(e.target.value)}
                      placeholder="Describe the agent's personality..."
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Capabilities (comma-separated)</label>
                    <input
                      type="text"
                      value={editCapabilities}
                      onChange={(e) => setEditCapabilities(e.target.value)}
                      placeholder="e.g. javascript, python, architecture"
                    />
                  </div>
                  <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {saveState && (
                    <div className={saveState.type === 'success' ? styles.saveSuccess : styles.saveError}>
                      {saveState.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
