import { useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import styles from '../styles/Panels.module.css'

const PROVIDERS = ['anthropic', 'openai', 'groq']

export function KeySettings({ health }) {
  const [open, setOpen] = useState(false)
  const llm = useSettingsStore((s) => s.llm)
  const setLlm = useSettingsStore((s) => s.setLlm)
  const clearLlm = useSettingsStore((s) => s.clearLlm)

  const [provider, setProvider] = useState(llm.provider || PROVIDERS[0])
  const [key, setKey] = useState(llm.key || '')
  const [model, setModel] = useState(llm.model || '')

  if (!health?.byok) return null

  const handleSave = () => {
    setLlm({ provider, key, model })
    setOpen(false)
  }

  const handleClear = () => {
    clearLlm()
    setProvider(PROVIDERS[0])
    setKey('')
    setModel('')
    setOpen(false)
  }

  return (
    <div className={styles.keySettings}>
      <button type="button" className={styles.keyButton} onClick={() => setOpen(!open)}>
        API key
      </button>
      {open && (
        <div className={styles.keyPopover}>
          <label className={styles.keyLabel}>Provider</label>
          <select className={styles.keySelect} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label className={styles.keyLabel}>API key</label>
          <input
            className={styles.keyInput}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-..."
          />

          <label className={styles.keyLabel}>Model (optional)</label>
          <input
            className={styles.keyInput}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="default"
          />

          <p className={styles.keyNote}>
            Stored in this browser only. Sent to this server only for tasks you submit.
          </p>

          <div className={styles.keyActions}>
            <button type="button" className={styles.keySave} onClick={handleSave} disabled={!key.trim()}>Save</button>
            <button type="button" className={styles.keyClear} onClick={handleClear}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}
