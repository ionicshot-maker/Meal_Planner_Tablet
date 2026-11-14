import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSync } from '@/sync/syncContext'
import { Button } from '@/components/ui'
import styles from './SyncBanners.module.css'

// Things the household sync needs a PERSON for, shown above whatever page is open. Everything else (a normal sync, going offline and
// coming back) is quiet: the status pill in the nav covers it.
const TABLE_NAMES: Record<string, [string, string]> = {
  ingredients: ['ingredient', 'ingredients'], recipes: ['recipe', 'recipes'], mealPlanDays: ['meal-plan day', 'meal-plan days'],
  groceryLists: ['grocery list', 'grocery lists'], householdItems: ['household item', 'household items'],
  collections: ['collection', 'collections'], references: ['kitchen reference page', 'kitchen reference pages'],
}

export function SyncBanners() {
  const { state, user, staleView, refreshView, pendingDeletes, confirmDeletes, putDeletedBack, heldCount } = useSync()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const banners: React.ReactNode[] = []

  if (state === 'needs-adopt') {
    banners.push(
      <div key="adopt" className={`${styles.banner} ${styles.warn}`} role="status">
        <span>Your household already has data. Join it to see it on this device.</span>
        <Button size="sm" onClick={() => navigate('/settings?section=data')}>Open sync settings</Button>
      </div>,
    )
  }

  if (state === 'needs-delete-confirm' && pendingDeletes) {
    const parts = Object.entries(pendingDeletes).map(([t, n]) => `${n} ${(TABLE_NAMES[t] ?? [t, t])[n === 1 ? 0 : 1]}`)
    banners.push(
      <div key="deletes" className={`${styles.banner} ${styles.warn}`} role="alert">
        <span>
          This device has removed <strong>{parts.join(', ')}</strong> since it last synced. Nothing has been removed for anyone else yet.
          Was that on purpose?
        </span>
        <span className={styles.actions}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(putDeletedBack)}>No — put them back</Button>
          <Button size="sm" disabled={busy} onClick={() => run(confirmDeletes)}>Yes — remove them for everyone</Button>
        </span>
      </div>,
    )
  }

  if (heldCount > 0) {
    banners.push(
      <div key="dups" className={`${styles.banner} ${styles.info}`} role="status">
        <span>{heldCount} {heldCount === 1 ? 'item has' : 'items have'} the same name as one you already have. Take a look when you have a moment.</span>
        <Button size="sm" variant="secondary" onClick={() => navigate('/settings?section=data')}>Review</Button>
      </div>,
    )
  }

  if (staleView) {
    banners.push(
      <div key="stale" className={`${styles.banner} ${styles.info}`} role="status">
        <span>Updated with changes from another device.</span>
        <Button size="sm" variant="secondary" onClick={refreshView}>Refresh this page</Button>
      </div>,
    )
  }

  if (user?.role === 'readonly') {
    banners.push(
      <div key="ro" className={`${styles.banner} ${styles.muted}`} role="status">
        <span>You have read-only access. You can look at everything, but changes you make here stay on this device and aren't shared.</span>
      </div>,
    )
  }

  if (banners.length === 0) return null
  return <div className={styles.stack}>{banners}</div>
}
