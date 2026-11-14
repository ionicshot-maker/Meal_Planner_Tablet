import type { SyncUiState } from '@/sync/syncContext'

// What the sync status pill says for each state (also used by the Help page, so the two can never disagree).
export const SYNC_STATE_LABELS: Record<SyncUiState, { label: string; tone: 'ok' | 'busy' | 'warn' | 'bad' | 'muted' }> = {
  checking:             { label: 'Checking…',               tone: 'muted' },
  unavailable:          { label: 'Not connected',           tone: 'muted' },
  'signed-out':         { label: 'Not signed in',           tone: 'warn' },
  idle:                 { label: 'Up to date',              tone: 'ok' },
  syncing:              { label: 'Syncing…',                tone: 'busy' },
  offline:              { label: "Offline — will sync later", tone: 'warn' },
  'read-only':          { label: 'Read-only',               tone: 'warn' },
  'needs-adopt':        { label: 'Action needed',           tone: 'warn' },
  'needs-delete-confirm': { label: 'Action needed',         tone: 'warn' },
  error:                { label: 'Sync problem',            tone: 'bad' },
}
