import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useSettingsStore } from '../stores/settingsStore'
import { createTask } from '../services/api'
import { KeySettings } from './KeySettings'
import styles from '../styles/Panels.module.css'

const TITLE_LIMIT = 200

function engineBannerText(health, llm) {
  if (!health) return null
  if (llm?.provider && llm?.key) {
    const label = { anthropic: 'Anthropic', openai: 'OpenAI', groq: 'Groq' }[llm.provider] || llm.provider
    return `Your key: ${label}`
  }
  if (health.engine === 'simulation') {
    return 'Simulation mode: results are placeholders. Add an API key.'
  }
  const label = { anthropic: 'Claude', openai: 'OpenAI' }[health.provider] || health.provider || health.engine
  return `Engine: ${label} (server key)`
}

export function TaskInput() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const connected = useGameStore((s) => s.connected)
  const health = useGameStore((s) => s.health)
  const upsertTask = useGameStore((s) => s.upsertTask)
  const llm = useSettingsStore((s) => s.llm)

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const task = await createTask({ title: title.trim(), description: description.trim() }, llm)
      upsertTask(task)
      setTitle('')
      setDescription('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const banner = engineBannerText(health, llm)

  return (
    <div className={styles.taskInputContainer}>
      {banner && <div className={styles.engineBanner}>{banner}</div>}

      <div className={styles.inputHeader}>
        <label>Assign a Task</label>
        <span className={styles.charCount}>{title.length}/{TITLE_LIMIT}</span>
      </div>
      <input
        className={styles.titleInput}
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, TITLE_LIMIT))}
        placeholder="What should the town build?"
        maxLength={TITLE_LIMIT}
      />
      <textarea
        className={styles.taskInput}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional details..."
        rows={2}
      />

      {error && <div className={styles.inputError}>{error}</div>}

      <div className={styles.buttonRow}>
        <button
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={!title.trim() || submitting || !connected}
        >
          {submitting ? 'Submitting...' : 'Submit Task'}
        </button>
        <KeySettings health={health} />
      </div>

      <div className={styles.serverStatus}>
        <span className={`${styles.dot} ${connected ? styles.online : ''}`} />
        <span>{connected ? 'Server online - agents ready' : 'Server offline - reconnecting...'}</span>
      </div>
    </div>
  )
}
