import { useEffect, useRef, useState } from 'react'
import styles from './OperationStatus.module.css'

// Shared status/progress surface for every long-running operation in the app
// (Cloud Sync, and — in later phases — Backup Import, JSON Import, Bulk
// Entry, Starter Library loading). See OPERATION_FEEDBACK_STANDARD.md at the
// repo root for the full spec this implements; this component owns all the
// timing/escalation logic described there so callers never have to
// reimplement it — a caller only ever reports what state it's in and what
// it knows right now.

export type OperationState = 'idle' | 'working' | 'done' | 'failed'

export interface OperationProgress {
  // Current stage label, e.g. "Uploading ingredients". Optional — omit for
  // single-stage operations (JSON Import, Bulk Entry) where there's nothing
  // more specific to say than the operation's own name.
  step?: string
  // Items processed so far in the current stage.
  current?: number
  // Total items in the current stage, if known. Omit/null when the total
  // genuinely isn't knowable yet (e.g. before an upfront count is fetched) —
  // the component falls back to step-only or spinner-only display.
  total?: number | null
}

export interface OperationStatusProps {
  state: OperationState
  progress?: OperationProgress
  // Required (and used) once state === 'done'. Must be specific — real
  // numbers, not a bare "Done!" — per the standard's success-state rule.
  doneMessage?: string
  // Required (and used) once state === 'failed'. Per the standard: what
  // step it was on, how many succeeded first, one plain-language next step.
  errorMessage?: string
  // Called when the done state auto-dismisses, or when the user
  // acknowledges a failed state via the dismiss button. Not called for
  // auto-dismiss timing decisions the caller doesn't need to know about.
  onDismiss?: () => void
  // Overrides the generic 1-minute+ reassurance line — most operations can
  // use the default, but a caller can supply a more specific one (e.g. a
  // Cloud-Sync-flavored "Large syncs can take several minutes...").
  reassuranceMessage?: string
  autoDismissMs?: number
  className?: string
}

const DEFAULT_AUTO_DISMISS_MS = 5000
const REASSURANCE_AT_MS = 60_000
const STUCK_AFTER_MS = 60_000
const DEFAULT_REASSURANCE = "This can take a few minutes on large operations — you can navigate away and check back, or wait here."

export function OperationStatus({
  state,
  progress,
  doneMessage,
  errorMessage,
  onDismiss,
  reassuranceMessage,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  className = '',
}: OperationStatusProps) {
  const prevStateRef = useRef<OperationState>(state)
  const startedAtRef = useRef<number | null>(null)
  const lastProgressSignatureRef = useRef<string>('')
  const lastProgressChangeAtRef = useRef<number>(Date.now())
  // Re-render on a tick while working, purely so time-based thresholds
  // (30s/1min/stuck) update live without the caller needing to pass a
  // fresh timestamp prop every second.
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (state === 'working' && prevStateRef.current !== 'working') {
      startedAtRef.current = Date.now()
      lastProgressChangeAtRef.current = Date.now()
      lastProgressSignatureRef.current = ''
    }
    prevStateRef.current = state
  }, [state])

  useEffect(() => {
    if (state !== 'working') return
    const id = setInterval(() => forceTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  useEffect(() => {
    if (state !== 'done') return
    const id = setTimeout(() => onDismiss?.(), autoDismissMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, autoDismissMs])

  if (state === 'idle') return null

  const signature = `${progress?.step ?? ''}|${progress?.current ?? ''}`
  if (signature !== lastProgressSignatureRef.current) {
    lastProgressSignatureRef.current = signature
    lastProgressChangeAtRef.current = Date.now()
  }

  const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0
  const stuck = state === 'working' && Date.now() - lastProgressChangeAtRef.current >= STUCK_AFTER_MS
  const showReassurance = state === 'working' && elapsedMs >= REASSURANCE_AT_MS

  const hasCount = progress?.current != null && progress?.total != null && (progress.total ?? 0) > 0
  const pct = hasCount ? Math.min(100, Math.round((progress!.current! / progress!.total!) * 100)) : null

  let primaryLine: string
  if (hasCount) {
    const currentFmt = progress!.current!.toLocaleString()
    const totalFmt = progress!.total!.toLocaleString()
    primaryLine = progress?.step ? `${progress.step}… ${currentFmt} of ${totalFmt}` : `${currentFmt} of ${totalFmt}`
  } else if (progress?.step) {
    primaryLine = `${progress.step}…`
  } else if (elapsedMs >= 30_000) {
    primaryLine = 'Working — this may take a few minutes.'
  } else {
    primaryLine = 'Starting…'
  }

  return (
    <div
      className={`${styles.status} ${styles[state]} ${className}`}
      role={state === 'failed' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {state === 'working' && (
        <>
          <div className={styles.workingRow}>
            <span className={styles.spinner} aria-hidden="true" />
            <span className={styles.primaryLine}>{primaryLine}</span>
          </div>
          {hasCount && (
            <div className={styles.progressTrack} role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
          )}
          {stuck && (
            <p className={styles.stuckLine}>⚠ This is taking longer than expected — it may still complete; check your connection if this continues.</p>
          )}
          {!stuck && showReassurance && (
            <p className={styles.reassuranceLine}>{reassuranceMessage ?? DEFAULT_REASSURANCE}</p>
          )}
        </>
      )}

      {state === 'done' && (
        <div className={styles.doneRow}>
          <p className={styles.doneMessage}>✓ {doneMessage}</p>
          <button className={styles.dismissBtn} onClick={() => onDismiss?.()} aria-label="Dismiss">×</button>
        </div>
      )}

      {state === 'failed' && (
        <div className={styles.failedRow}>
          <p className={styles.errorMessage}>⚠ {errorMessage}</p>
          <button className={styles.dismissBtn} onClick={() => onDismiss?.()} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  )
}
