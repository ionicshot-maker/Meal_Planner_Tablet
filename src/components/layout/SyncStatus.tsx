import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Cloud, CloudOff, Loader2, TriangleAlert, Lock } from 'lucide-react'
import { useSync, type SyncUiState } from '@/sync/syncContext'
import { SYNC_STATE_LABELS } from './syncStateLabels'
import { formatRelativeTime } from '@/utils/relativeTime'
import styles from './SyncStatus.module.css'

// The always-visible answer to "is my stuff shared with the rest of the household right now?". Hidden when there is no household
// server behind this address (the app is then simply a local app and there is nothing to report). Tapping it opens Settings > Data.
function Icon({ state }: { state: SyncUiState }) {
  switch (state) {
    case 'idle': return <Check size={16} />
    case 'syncing': case 'checking': return <Loader2 size={16} className={styles.spin} />
    case 'offline': return <CloudOff size={16} />
    case 'read-only': return <Lock size={16} />
    case 'error': case 'needs-adopt': case 'needs-delete-confirm': return <TriangleAlert size={16} />
    default: return <Cloud size={16} />
  }
}

export function SyncStatus() {
  const { state, lastSyncAt } = useSync()
  const navigate = useNavigate()
  // "3 minutes ago" only recomputes on render — tick so it doesn't read "just now" forever.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (state === 'unavailable' || state === 'checking') return null
  const { label, tone } = SYNC_STATE_LABELS[state]
  const detail = state === 'idle' ? ` · ${formatRelativeTime(lastSyncAt ?? undefined)}` : ''

  return (
    <button
      type="button"
      className={`${styles.pill} ${styles[tone]}`}
      onClick={() => navigate('/settings?section=data')}
      aria-label={`Sync status: ${label}${detail}. Open sync settings.`}
      title={`${label}${detail}`}
    >
      <span aria-hidden="true"><Icon state={state} /></span>
      <span className={styles.text}>{label}{detail}</span>
    </button>
  )
}
