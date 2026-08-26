import { useSettingsStore } from '../stores/settingsStore'
import { WORLDS, WORLD_IDS } from '../worlds/index'
import styles from '../styles/Panels.module.css'

export function WorldSwitcher() {
  const worldId = useSettingsStore((s) => s.worldId)
  const setWorldId = useSettingsStore((s) => s.setWorldId)

  return (
    <div className={styles.worldSwitcher}>
      {WORLD_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`${styles.worldButton} ${id === worldId ? styles.worldButtonActive : ''}`}
          onClick={() => setWorldId(id)}
        >
          {WORLDS[id].name}
        </button>
      ))}
    </div>
  )
}
