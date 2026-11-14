import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Modal, Toggle, OperationStatus } from '@/components/ui'
import type { OperationState } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { useSync, type HeldItem } from '@/sync/syncContext'
import type { ConflictRow } from '@/sync/storeCore'
import type { DuplicateAction } from '@/sync/duplicates'
import type { DuplicateCounts } from '@/sync/duplicatePort'
import { SYNC_STATE_LABELS } from '@/components/layout/syncStateLabels'
import { formatRelativeTime } from '@/utils/relativeTime'
import { AccountSection } from './AccountSection'
import styles from './CloudSyncSection.module.css'

const TABLE_LABEL: Record<string, string> = {
  ingredients: 'ingredient', recipes: 'recipe', mealPlanDays: 'meal-plan day', groceryLists: 'grocery list',
  householdItems: 'household item', collections: 'collection', references: 'kitchen reference page', settings: 'settings',
}
const label = (t: string) => TABLE_LABEL[t] ?? t
const nameOf = (rec: Record<string, unknown> | null | undefined, fallback: string) =>
  String(rec?.name ?? rec?.title ?? rec?.date ?? fallback)

function describeCounts(c: DuplicateCounts): string {
  if (!c) return ''
  const parts: string[] = []
  if (c.kind === 'ingredient') {
    if (c.counts.recipes) parts.push(`${c.counts.recipes} recipe${c.counts.recipes === 1 ? '' : 's'}`)
    if (c.counts.groceryLists) parts.push(`${c.counts.groceryLists} grocery list${c.counts.groceryLists === 1 ? '' : 's'}`)
    if (c.counts.macroLogs) parts.push(`${c.counts.macroLogs} macro entr${c.counts.macroLogs === 1 ? 'y' : 'ies'}`)
  } else {
    if (c.counts.mealPlanDays) parts.push(`${c.counts.mealPlanDays} meal-plan day${c.counts.mealPlanDays === 1 ? '' : 's'}`)
    if (c.counts.mealPlanTemplates) parts.push(`${c.counts.mealPlanTemplates} weekly template${c.counts.mealPlanTemplates === 1 ? '' : 's'}`)
    if (c.counts.collections) parts.push(`${c.counts.collections} collection${c.counts.collections === 1 ? '' : 's'}`)
    if (c.counts.macroLogs) parts.push(`${c.counts.macroLogs} macro entr${c.counts.macroLogs === 1 ? 'y' : 'ies'}`)
  }
  return parts.length ? ` Updated ${parts.join(', ')} that used it.` : ''
}

export function CloudSyncSection() {
  const { settings, updateSettings } = useSettings()
  const { state } = useSync()

  return (
    <div className={styles.syncSection}>
      <h2 className={styles.sectionTitle}>Household Sync</h2>
      <p className={styles.desc}>
        Your ingredients, recipes, collections, kitchen reference pages, meal plans, grocery lists, household items, and shared
        settings are kept the same on every device in your home, automatically. Personal things — your API keys, text size, and
        macro logs — stay on each device.
      </p>

      <AccountSection />

      <Toggle
        checked={!settings.cloudSyncPromptDismissed}
        onChange={checked => updateSettings({ cloudSyncPromptDismissed: !checked })}
        label="Remind me to sign in when I open the app signed out"
        id="cloud-sync-prompt-toggle"
      />

      {state !== 'unavailable' && state !== 'checking' && state !== 'signed-out' && <SyncPanel />}
    </div>
  )
}

// ─── The sync panel (signed in) ─────────────────────────────────────────────

function SyncPanel() {
  const sync = useSync()
  const { state, user, lastSyncAt, message, pendingDeletes, conflictCount, heldCount } = sync
  const isOwner = user?.role === 'owner'
  const { label: stateLabel } = SYNC_STATE_LABELS[state]
  const [op, setOp] = useState<{ state: OperationState; done?: string; error?: string }>({ state: 'idle' })
  const [confirmReplace, setConfirmReplace] = useState(false)
  const syncing = state === 'syncing'

  async function run(fn: () => Promise<void>, doneMessage: string) {
    setOp({ state: 'working' })
    try { await fn(); setOp({ state: 'done', done: doneMessage }) }
    catch (e) { setOp({ state: 'failed', error: e instanceof Error ? e.message : String(e) }) }
  }

  return (
    <>
      <h3 className={styles.subTitle}>Sync status</h3>
      <Card padding="md">
        <p className={styles.statusLine}><strong>{stateLabel}</strong>{state === 'idle' && ` — last checked ${formatRelativeTime(lastSyncAt ?? undefined)}`}</p>
        <p className={styles.desc}>
          Syncing happens by itself: when you sign in, a few seconds after you change something, about once a minute while the app is
          open, when you come back to it, and when your connection returns. You can also do it right now.
        </p>
        {message && <p className={state === 'error' ? styles.syncError : styles.desc}>{message}</p>}
        {state === 'offline' && <p className={styles.desc}>Whatever you change meanwhile is kept on this device and goes up as soon as the connection is back.</p>}
        {state === 'read-only' && <p className={styles.desc}>Ask an owner if you need to be able to make changes. You still receive everyone else's.</p>}
        <div className={styles.syncBtnGroup}>
          <Button onClick={() => void sync.syncNow()} disabled={syncing || state === 'needs-adopt'}>{syncing ? 'Syncing…' : '↕ Sync now'}</Button>
        </div>

        {state === 'needs-adopt' && (
          <div className={styles.callout}>
            <p><strong>Your household already has data.</strong> This device hasn't joined it yet, so nothing has been sent or received.</p>
            <p className={styles.desc}>
              Joining replaces what's on this device with the household's ingredients, recipes, and plans. If this device has anything
              of its own, a copy is saved to a file first.
            </p>
            <div className={styles.syncBtnGroup}>
              <Button disabled={op.state === 'working'} onClick={() => run(sync.adoptServerData, "This device now has the household's data.")}>
                Join — use the household's data here
              </Button>
              {isOwner && !confirmReplace && (
                <Button variant="secondary" disabled={op.state === 'working'} onClick={() => setConfirmReplace(true)}>This device has the real data…</Button>
              )}
            </div>
            {isOwner && confirmReplace && (
              <div className={styles.callout}>
                <p>
                  <strong>Make the household's server match this device instead?</strong> Use this only if this device holds the real data and
                  what's on the server is just starter data from another device. The server saves its own backup first, and what's on it but not
                  here is set aside, not erased. Other devices then follow this one.
                </p>
                <div className={styles.syncBtnGroup}>
                  <Button variant="secondary" disabled={op.state === 'working'} onClick={() => setConfirmReplace(false)}>Cancel</Button>
                  <Button disabled={op.state === 'working'} onClick={() => run(async () => { await sync.makeServerMatchThisDevice(); setConfirmReplace(false) }, 'The household now matches this device.')}>
                    Yes, make the server match this device
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {state === 'needs-delete-confirm' && pendingDeletes && (
          <div className={styles.callout}>
            <p>
              <strong>This device removed {Object.values(pendingDeletes).reduce((a, b) => a + b, 0)} items since it last synced</strong>
              {' '}({Object.entries(pendingDeletes).map(([t, n]) => `${n} ${label(t)}${n === 1 ? '' : 's'}`).join(', ')}). Nothing has been removed for anyone else yet.
            </p>
            <p className={styles.desc}>If you meant to clear them out, send the removals. If not — say a reset or a restore went wrong — put them back from the household.</p>
            <div className={styles.syncBtnGroup}>
              <Button variant="secondary" disabled={op.state === 'working'} onClick={() => run(sync.putDeletedBack, 'The removed items are back.')}>No — put them back</Button>
              <Button disabled={op.state === 'working'} onClick={() => run(sync.confirmDeletes, 'The removals were sent to everyone.')}>Yes — remove them for everyone</Button>
            </div>
          </div>
        )}

        <OperationStatus
          state={op.state}
          doneMessage={op.done}
          errorMessage={op.error ? `${op.error} Nothing was lost — you can try again.` : undefined}
          onDismiss={() => setOp({ state: 'idle' })}
          reassuranceMessage="A large household can take a few minutes the first time — you can wait here."
        />
      </Card>

      {heldCount > 0 && <DuplicateReview />}
      {conflictCount > 0 && <OverlapList />}
    </>
  )
}

// ─── Duplicate review ───────────────────────────────────────────────────────

function DuplicateReview() {
  const sync = useSync()
  const [items, setItems] = useState<HeldItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<HeldItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => setItems(await sync.listHeldDuplicates()), [sync])
  useEffect(() => { void load() }, [load, sync.heldCount])

  async function resolveOne(item: HeldItem, action: DuplicateAction) {
    const counts = await sync.resolveDuplicate(item.held.key, action)
    return describeCounts(counts)
  }

  async function single(action: DuplicateAction) {
    if (!open) return
    setBusy(true); setError('')
    try {
      const extra = await resolveOne(open, action)
      setNote(`Done.${extra}`)
      setOpen(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not settle this one — nothing was changed. Please try again.')
    } finally { setBusy(false) }
  }

  async function bulk(choice: 'keep-local' | 'keep-cloud' | 'keep-newer') {
    const targets = selected.size > 0 ? items.filter(i => selected.has(i.held.key)) : items
    if (!targets.length || busy) return
    setBusy(true); setError(''); setNote('')
    let ok = 0
    const failed: string[] = []
    for (const item of targets) {
      const incomingNewer = (item.held.cloud.updatedAt as string) > ((item.local?.updatedAt as string) ?? '')
      const action: DuplicateAction = choice === 'keep-newer' ? (incomingNewer ? 'keep-cloud' : 'keep-local') : choice
      try { await resolveOne(item, action); ok++ }
      catch (e) { failed.push(`${nameOf(item.held.cloud, item.held.cloudId)}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    setSelected(new Set())
    setNote(`${ok} settled.`)
    if (failed.length) setError(`Could not settle: ${failed.join('; ')}`)
    await load()
    setBusy(false)
  }

  const toggle = (key: string) => setSelected(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const allSelected = items.length > 0 && selected.size === items.length

  return (
    <>
      <h3 className={styles.subTitle}>Same name, different item ({items.length})</h3>
      <Card padding="md">
        <p className={styles.desc}>
          Someone added an item with the same name as one you already have, so it wasn't added automatically. This happens when two
          devices make the same ingredient or recipe on their own — often when the starter ingredient library was loaded separately on
          more than one device. For each one, choose which to keep.
        </p>
        <div className={styles.dupBulkBtnGroup}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk('keep-local')}>{selected.size ? `Keep mine (${selected.size})` : 'Keep all mine'}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk('keep-cloud')}>{selected.size ? `Keep theirs (${selected.size})` : 'Keep all theirs'}</Button>
          <Button size="sm" disabled={busy} onClick={() => bulk('keep-newer')}>{selected.size ? `Keep newer (${selected.size})` : 'Keep all newer'}</Button>
        </div>
        <label className={styles.dupSelectAllRow}>
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map(i => i.held.key)))} aria-label="Select all" />
          {selected.size ? `${selected.size} selected` : 'Select all'}
        </label>
        {items.map(item => (
          <div key={item.held.key} className={styles.dupItem}>
            <input type="checkbox" checked={selected.has(item.held.key)} onChange={() => toggle(item.held.key)} aria-label={`Select ${nameOf(item.held.cloud, item.held.cloudId)}`} />
            {item.held.table === 'ingredients' ? '🥕' : '📖'} <strong>{nameOf(item.held.cloud, item.held.cloudId)}</strong>
            <button type="button" className={styles.dupReviewLink} onClick={() => { setOpen(item); setError('') }}>Review</button>
          </div>
        ))}
        {note && <p className={styles.syncSuccess}>✓ {note}</p>}
        {error && !open && <p className={styles.syncError}>{error}</p>}
      </Card>

      {open && (
        <Modal
          open
          onClose={() => { if (!busy) { setOpen(null); setError('') } }}
          title="Same name found"
          size="sm"
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => { setOpen(null); setError('') }}>Not now</Button>
              <Button variant="secondary" disabled={busy} onClick={() => single('keep-local')}>{busy ? 'Working…' : 'Keep mine'}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => single('keep-both')}>{busy ? 'Working…' : 'Keep both'}</Button>
              <Button disabled={busy} onClick={() => single('keep-cloud')}>{busy ? 'Working…' : 'Keep theirs'}</Button>
            </>
          }
        >
          <p>
            You already have a {label(open.held.table)} called <strong>"{nameOf(open.local, nameOf(open.held.cloud, ''))}"</strong>, and
            the household has a different one with the same name.
          </p>
          <p className={styles.modalHelp}>
            <strong>Keep mine</strong> — keep yours; theirs is removed for everyone.<br />
            <strong>Keep both</strong> — keep both, side by side.<br />
            <strong>Keep theirs</strong> — replace yours with theirs. Recipes and lists that used yours are switched over to theirs.
          </p>
          {error && <p className={styles.syncError}>⚠ {error}</p>}
        </Modal>
      )}
    </>
  )
}

// ─── Changes that overlapped ────────────────────────────────────────────────

function OverlapList() {
  const sync = useSync()
  const [rows, setRows] = useState<ConflictRow[]>([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const load = useCallback(async () => setRows(await sync.listConflicts(50)), [sync])
  useEffect(() => { if (open) void load() }, [open, load, sync.conflictCount])

  return (
    <>
      <h3 className={styles.subTitle}>Changes that overlapped ({sync.conflictCount})</h3>
      <Card padding="md">
        <p className={styles.desc}>
          Now and then two people change the same thing before their devices have talked to each other. The newer change is kept, and
          the other version is saved here so nothing is ever lost. You can bring one back if the wrong one won.
        </p>
        <div className={styles.syncBtnGroup}>
          <Button size="sm" variant="secondary" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Show'}</Button>
          {open && <Button size="sm" variant="secondary" onClick={async () => { await sync.clearAllConflicts(); await load() }}>Clear all</Button>}
        </div>
        {error && <p className={styles.syncError}>{error}</p>}
        {open && rows.map(r => {
          const losing = (r.kept === 'local' ? r.server : r.local) as Record<string, unknown> | null
          const name = nameOf((r.local ?? r.server) as Record<string, unknown>, r.recordId)
          return (
            <div key={r.id} className={styles.dupItem}>
              <span>
                <strong>{name}</strong> ({label(r.table)}) — {formatRelativeTime(r.at)}.{' '}
                {r.kept === 'local' ? 'Your version was kept.' : "The other device's version was kept."}
              </span>
              {losing && r.table !== 'settings' && (
                <button type="button" className={styles.dupReviewLink} onClick={async () => {
                  setError('')
                  try { await sync.restoreConflictVersion(r.id); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
                }}>Bring back the other version</button>
              )}
              <button type="button" className={styles.dupReviewLink} onClick={async () => { await sync.dismissConflict(r.id); await load() }}>Dismiss</button>
            </div>
          )
        })}
      </Card>
    </>
  )
}
