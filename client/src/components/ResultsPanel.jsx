import { useGameStore } from '../stores/gameStore'
import { taskFileUrl } from '../services/api'
import { Panel } from './Panels'
import styles from '../styles/Panels.module.css'

export function ResultsPanel() {
  const tasks = useGameStore((s) => s.tasks)
  const completed = tasks.filter((t) => t.status === 'completed')

  return (
    <Panel title="Results" badge={completed.length}>
      {completed.length === 0 ? (
        <div className={styles.placeholder}>Completed task results will appear here</div>
      ) : (
        <div className={styles.resultsList}>
          {completed.map((task) => (
            <div key={task.id} className={styles.resultItem}>
              <div className={styles.resultHeader}>
                <span className={styles.resultTitle}>{task.title}</span>
                <span className={styles.resultStatus}>{task.engine === 'simulation' ? 'simulated' : task.engine}</span>
              </div>
              {task.result?.summary && <div className={styles.resultSummary}>{task.result.summary}</div>}
              {task.files.length > 0 && (
                <div className={styles.resultFiles}>
                  {task.files.map((file) => (
                    <a key={file.name} className={styles.resultFile} href={taskFileUrl(task.id, file.name)} download={file.name}>
                      {file.name}
                    </a>
                  ))}
                </div>
              )}
              {task.result?.previewUrl && (
                <a className={styles.previewLink} href={task.result.previewUrl} target="_blank" rel="noreferrer">
                  Open preview
                </a>
              )}
              {task.completedAt && (
                <div className={styles.resultTime}>{new Date(task.completedAt).toLocaleTimeString()}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
