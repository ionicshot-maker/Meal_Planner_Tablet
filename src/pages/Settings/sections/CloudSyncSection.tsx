import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Card, Input, Select, Modal, Toggle, OperationStatus } from '@/components/ui'
import type { OperationState, OperationProgress } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import {
  runSync, runFamilyShareSync, generateSyncCode,
  isSupabaseConfigured, SUPABASE_SETUP_SQL,
  AUTH_MIGRATION_SQL, AUTH_MIGRATION_FIX_SQL, AUTH_MIGRATION_FIX2_SQL, AUTH_MIGRATION_FIX3_SQL,
  resolveIngredientDuplicate, resolveRecipeDuplicate,
  type SyncSummary, type SyncDuplicate,
} from '@/db/supabase'
import { AccountSection } from './AccountSection'
import { formatRelativeTime } from '@/utils/relativeTime'
import type { FamilyShareRole, Ingredient, Recipe } from '@/types'
import styles from './CloudSyncSection.module.css'

type SyncDirection = 'both' | 'push' | 'pull'

// Four scripts, meant to be run back-to-back in this exact order in a fresh
// Supabase project (each was authored as a standalone patch on top of the
// last during live testing, and each says so in its own header comment).
// Concatenating them here — rather than hand-authoring one "final state"
// script — means what a new user runs is exactly what was actually tested,
// not a rewritten summary of it.
const AUTH_SETUP_SQL_COMBINED = [
  AUTH_MIGRATION_SQL, AUTH_MIGRATION_FIX_SQL, AUTH_MIGRATION_FIX2_SQL, AUTH_MIGRATION_FIX3_SQL,
].join('\n\n\n')

export function CloudSyncSection() {
  const { settings, updateSettings, reloadSettings } = useSettings()
  const [familySyncing, setFamilySyncing] = useState(false)
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [familySummary, setFamilySummary] = useState<SyncSummary | null>(null)
  // Household Sync's shared status/progress surface — see OPERATION_FEEDBACK_STANDARD.md
  // and OperationStatus (src/components/ui). Family Share sync is deliberately
  // untouched in this phase; it keeps its own simpler syncing/summary state below.
  const [syncState, setSyncState] = useState<OperationState>('idle')
  const [syncProgress, setSyncProgress] = useState<OperationProgress | undefined>(undefined)
  const syncing = syncState === 'working'
  const [showSQL, setShowSQL] = useState(false)
  const [showAuthSQL, setShowAuthSQL] = useState(false)
  const [dupToResolve, setDupToResolve] = useState<SyncDuplicate | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')

  // "X ago" only recomputes on render — tick every minute so it doesn't read
  // "just now" for the whole time this section happens to stay open.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const configured = isSupabaseConfigured(settings)

  async function handleSync(direction: SyncDirection) {
    // Flips synchronously, before the first `await` — the status region
    // appears on the very next paint, well inside the 200-300ms bar
    // OPERATION_FEEDBACK_STANDARD.md sets for "did my click register."
    setSyncState('working')
    setSyncProgress(undefined)
    setSummary(null)
    try {
      const result = await runSync(settings, direction, update => setSyncProgress(update))
      setSummary(result)
      // Only stamp "last synced" on a clean run — a sync that errored didn't
      // actually reconcile anything, so it shouldn't read as up to date.
      if (result.errors.length === 0) {
        setSyncState('done')
        await updateSettings({ lastHouseholdSyncAt: new Date().toISOString() })
      } else {
        setSyncState('failed')
      }
      // Settings may have been written directly to IndexedDB during sync — refresh context state
      await reloadSettings()
    } catch (e) {
      setSummary({ addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [], errors: [e instanceof Error ? e.message : String(e)] })
      setSyncState('failed')
    }
  }

  // OperationStatus's success text is real numbers per the standard's
  // success-state rule, not a bare "Done!" — matches the wording this app
  // already used before this component existed, so a returning user sees
  // the same familiar phrasing, just inside the new shared surface.
  function buildSyncDoneMessage(s: SyncSummary): string {
    const hasActivity = s.addedLocally + s.uploadedToCloud + s.updatedToNewer > 0
    const hasDups = s.duplicatesForReview.length > 0
    const base = `${s.addedLocally} new ${s.addedLocally === 1 ? 'item' : 'items'} added from cloud, ` +
      `${s.uploadedToCloud} ${s.uploadedToCloud === 1 ? 'item' : 'items'} uploaded, ` +
      `${s.updatedToNewer} updated to newer version.`
    return !hasActivity && !hasDups ? `${base} Everything is already up to date.` : base
  }

  // Error-state minimum bar per the standard: what happened, how much
  // succeeded first, one plain-language next step — runSync's per-store
  // try/catch means "failed" here can still mean several stores succeeded
  // before/around the ones that errored, so that's surfaced explicitly
  // rather than implying nothing happened.
  function buildSyncErrorMessage(s: SyncSummary): string {
    const succeeded = s.addedLocally + s.uploadedToCloud + s.updatedToNewer
    const succeededNote = succeeded > 0 ? ` ${succeeded} item${succeeded === 1 ? '' : 's'} synced successfully despite this.` : ''
    return `${s.errors.join(' ')}${succeededNote} You can retry — already-synced items won't be duplicated.`
  }

  async function handleFamilySync(direction: SyncDirection) {
    setFamilySyncing(true)
    setFamilySummary(null)
    try {
      const result = await runFamilyShareSync(settings, direction)
      setFamilySummary(result)
      if (result.errors.length === 0) {
        await updateSettings({ lastFamilySyncAt: new Date().toISOString() })
      }
    } catch (e) {
      setFamilySummary({ addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [], errors: [String(e)] })
    } finally {
      setFamilySyncing(false)
    }
  }

  function handleGenerateHouseholdCode() {
    const code = generateSyncCode(settings.householdName)
    updateSettings({ householdSyncCode: code })
  }

  function handleRegenerateFamilyCode() {
    const code = generateSyncCode()
    updateSettings({ familyShareCode: code })
  }

  // resolveIngredientDuplicate() is now a genuinely atomic IndexedDB
  // transaction (2026-07-24 fix) — it can throw (e.g. a real transaction
  // failure) instead of silently doing nothing, so this needs real error
  // handling now, not just a bare await. Previously there was NO catch here
  // at all: a throw would have surfaced as an unhandled promise rejection
  // with zero user-visible feedback. On failure the modal stays open
  // (dupToResolve is not cleared) so the user can see the error and retry
  // or Skip, rather than the dialog silently vanishing either way.
  async function handleResolveDuplicate(action: 'keep-local' | 'keep-cloud' | 'keep-both') {
    if (!dupToResolve) return
    setResolving(true)
    setResolveError('')
    try {
      if (dupToResolve.type === 'ingredient') {
        await resolveIngredientDuplicate(action, dupToResolve as SyncDuplicate & { type: 'ingredient' }, settings)
      } else {
        await resolveRecipeDuplicate(action, dupToResolve as SyncDuplicate & { type: 'recipe' }, settings)
      }
      // Remove from the pending list
      if (summary) {
        setSummary({
          ...summary,
          duplicatesForReview: summary.duplicatesForReview.filter(d => d !== dupToResolve),
        })
      }
      setDupToResolve(null)
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'Could not resolve this duplicate — nothing was changed. Please try again.')
    } finally {
      setResolving(false)
    }
  }

  async function resolveOne(dup: SyncDuplicate, action: 'keep-local' | 'keep-cloud' | 'keep-newer'): Promise<'keep-local' | 'keep-cloud'> {
    const resolvedAction: 'keep-local' | 'keep-cloud' = action === 'keep-newer'
      ? (new Date(dup.cloudItem.updatedAt).getTime() > new Date(dup.localItem.updatedAt).getTime() ? 'keep-cloud' : 'keep-local')
      : action
    if (dup.type === 'ingredient') {
      await resolveIngredientDuplicate(resolvedAction, dup as SyncDuplicate & { type: 'ingredient' }, settings)
    } else {
      await resolveRecipeDuplicate(resolvedAction, dup as SyncDuplicate & { type: 'recipe' }, settings)
    }
    return resolvedAction
  }

  function makeBulkResolver(setSummaryState: Dispatch<SetStateAction<SyncSummary | null>>) {
    return async function bulkResolve(
      dups: SyncDuplicate[],
      action: 'keep-local' | 'keep-cloud' | 'keep-newer',
    ): Promise<{ keptLocal: number; keptCloud: number }> {
      let keptLocal = 0
      let keptCloud = 0
      // Each item gets its own try/catch — a genuine transaction failure on
      // one duplicate must not abort resolving the rest of the batch, and
      // must not be silently swallowed either. Failed items stay in
      // duplicatesForReview (so they're visibly still pending, not lost)
      // and their errors are appended to the existing summary.errors list,
      // reusing the mechanism SyncResultDisplay already renders errors
      // through rather than adding a second, parallel error surface.
      const resolvedDups: SyncDuplicate[] = []
      const errors: string[] = []
      for (const dup of dups) {
        try {
          const resolvedAction = await resolveOne(dup, action)
          if (resolvedAction === 'keep-local') keptLocal++
          else keptCloud++
          resolvedDups.push(dup)
        } catch (e) {
          const name = (dup.localItem as { name?: string }).name ?? dup.type
          errors.push(`Could not resolve duplicate "${name}": ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const resolvedSet = new Set(resolvedDups)
      setSummaryState(prev => prev && {
        ...prev,
        duplicatesForReview: prev.duplicatesForReview.filter(d => !resolvedSet.has(d)),
        errors: errors.length > 0 ? [...prev.errors, ...errors] : prev.errors,
      })
      return { keptLocal, keptCloud }
    }
  }

  const bulkResolveHousehold = makeBulkResolver(setSummary)
  const bulkResolveFamily = makeBulkResolver(setFamilySummary)

  const roleOptions: { value: FamilyShareRole; label: string }[] = [
    { value: 'owner',       label: 'Owner (full access)' },
    { value: 'contributor', label: 'Contributor (can push and pull)' },
    { value: 'readonly',    label: 'Read Only (can only pull)' },
  ]

  return (
    <div className={styles.syncSection}>
      <h2 className={styles.sectionTitle}>Cloud Sync</h2>

      {!configured && (
        <div className={styles.setupBanner}>
          <span className={styles.setupIcon}>☁️</span>
          <div>
            <p className={styles.setupTitle}>Cloud sync requires a free Supabase account</p>
            <p className={styles.setupDesc}>
              Supabase is a free service that stores your data in the cloud so you can access it from any device.
              Add your Supabase URL and key in <strong>Settings → Integrations</strong> to get started.
            </p>
            <button className={styles.sqlBtn} onClick={() => setShowSQL(v => !v)}>
              {showSQL ? 'Hide setup SQL ▲' : 'Show database setup SQL ▼'}
            </button>
            {showSQL && (
              <pre className={styles.sqlBlock}>{SUPABASE_SETUP_SQL}</pre>
            )}
          </div>
        </div>
      )}

      <AccountSection />

      {configured && (
        <p className={styles.desc}>
          Signing up or creating/joining a household above erroring out with a database error usually means
          this Supabase project is missing some setup.{' '}
          <button className={styles.sqlBtn} onClick={() => setShowAuthSQL(v => !v)} style={{ display: 'inline' }}>
            {showAuthSQL ? 'Hide account/sign-in setup SQL ▲' : 'Show account/sign-in setup SQL ▼'}
          </button>
        </p>
      )}
      {showAuthSQL && (
        <pre className={styles.sqlBlock}>{AUTH_SETUP_SQL_COMBINED}</pre>
      )}

      <Toggle
        checked={!settings.cloudSyncPromptDismissed}
        onChange={checked => updateSettings({ cloudSyncPromptDismissed: !checked })}
        label="Show the sign-in reminder on launch when not signed in"
        id="cloud-sync-prompt-toggle"
      />

      {/* ── Household Sync ─────────────────────────────────────────── */}
      <h3 className={styles.subTitle}>Household Sync</h3>
      <p className={styles.desc}>
        Sync everything between your devices — ingredients, recipes, recipe collections, kitchen
        reference pages, meal plans, grocery lists, household items, and settings. Use the same code
        on every device in your home.
      </p>
      <p className={styles.desc}>
        Household Sync shares everything except personal API keys and device theme preferences.
        Macro logs and weight history are personal and stay on each device.
      </p>

      <Card padding="md">
        <div className={styles.codeRow}>
          <Input
            label="Household Sync Code"
            value={settings.householdSyncCode}
            onChange={e => updateSettings({ householdSyncCode: e.target.value })}
            placeholder="e.g. angelo-family-2026"
            hint="All devices using this code will sync together. Share only with people in your home."
          />
          <Button
            variant="secondary"
            size="sm"
            className={styles.genBtn}
            onClick={handleGenerateHouseholdCode}
          >
            Generate Code
          </Button>
        </div>

        <div className={styles.syncBtnGroup}>
          <Button
            onClick={() => handleSync('both')}
            disabled={syncing || !configured || !settings.householdSyncCode}
          >
            {syncing ? 'Syncing…' : '↕ Sync with Cloud'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSync('push')}
            disabled={syncing || !configured || !settings.householdSyncCode}
          >
            ↑ Push to Cloud
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSync('pull')}
            disabled={syncing || !configured || !settings.householdSyncCode}
          >
            ↓ Pull from Cloud
          </Button>
        </div>
        <p className={styles.lastSynced}>
          Last synced on this device: {formatRelativeTime(settings.lastHouseholdSyncAt)}
        </p>

        <OperationStatus
          state={syncState}
          progress={syncProgress}
          doneMessage={summary ? buildSyncDoneMessage(summary) : undefined}
          errorMessage={summary ? buildSyncErrorMessage(summary) : undefined}
          onDismiss={() => setSyncState('idle')}
          reassuranceMessage="Large syncs can take several minutes — you can close this tab and check back, or wait here."
        />
        {summary && <SyncResultDisplay summary={summary} onReviewDuplicate={setDupToResolve} onBulkResolve={bulkResolveHousehold} showSummary={false} />}
      </Card>

      {/* ── Family Share ───────────────────────────────────────────── */}
      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-5)' }}>Family Share</h3>
      <p className={styles.desc}>
        Share recipes and nutritional info with family in another home — without sharing prices or store names.
        They enter their own local prices. Give them the Family Share Code (different from your household code).
      </p>

      <Card padding="md">
        <div className={styles.codeRow}>
          <Input
            label="Family Share Code"
            value={settings.familyShareCode}
            onChange={e => updateSettings({ familyShareCode: e.target.value })}
            placeholder="e.g. angelo-share-2026"
            hint="Share this code with out-of-home family members. Regenerate it to disconnect them."
          />
          <Button
            variant="secondary"
            size="sm"
            className={styles.genBtn}
            onClick={handleRegenerateFamilyCode}
          >
            Regenerate
          </Button>
        </div>

        <Select
          label="My role in this family share"
          options={roleOptions}
          value={settings.familyShareRole ?? 'owner'}
          onChange={e => updateSettings({ familyShareRole: e.target.value as FamilyShareRole })}
        />

        <div className={styles.syncBtnGroup} style={{ marginTop: 'var(--space-3)' }}>
          <Button
            onClick={() => handleFamilySync('both')}
            disabled={familySyncing || !configured || !settings.familyShareCode || settings.familyShareRole === 'readonly'}
          >
            {familySyncing ? 'Syncing…' : '↕ Sync Family Share'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleFamilySync('pull')}
            disabled={familySyncing || !configured || !settings.familyShareCode}
          >
            ↓ Pull from Family
          </Button>
        </div>

        {settings.familyShareRole === 'readonly' && (
          <p className={styles.roleNote}>Read-only mode: you can pull from family but not push changes.</p>
        )}
        <p className={styles.lastSynced}>
          Last synced on this device: {formatRelativeTime(settings.lastFamilySyncAt)}
        </p>

        {familySummary && <SyncResultDisplay summary={familySummary} onReviewDuplicate={setDupToResolve} onBulkResolve={bulkResolveFamily} />}
      </Card>

      {/* ── Duplicate review modal ─────────────────────────────────── */}
      {dupToResolve && (
        <Modal
          open
          onClose={() => { if (!resolving) { setDupToResolve(null); setResolveError('') } }}
          title="Duplicate Found"
          size="sm"
          footer={
            <>
              <Button variant="secondary" disabled={resolving} onClick={() => { setDupToResolve(null); setResolveError('') }}>Skip</Button>
              <Button variant="secondary" disabled={resolving} onClick={() => handleResolveDuplicate('keep-local')}>{resolving ? 'Resolving…' : 'Keep Mine'}</Button>
              <Button variant="secondary" disabled={resolving} onClick={() => handleResolveDuplicate('keep-both')}>{resolving ? 'Resolving…' : 'Keep Both'}</Button>
              <Button disabled={resolving} onClick={() => handleResolveDuplicate('keep-cloud')}>{resolving ? 'Resolving…' : 'Keep Theirs'}</Button>
            </>
          }
        >
          <p>
            A {dupToResolve.type} named <strong>"{(dupToResolve.localItem as Ingredient | Recipe).name}"</strong> already
            exists locally but the cloud has a different version with the same name.
          </p>
          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            <strong>Keep Mine</strong> — discard the cloud version.<br />
            <strong>Keep Both</strong> — save both (cloud version added with its own ID).<br />
            <strong>Keep Theirs</strong> — replace your local version with the cloud version.
          </p>
          {resolveError && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
              ⚠ {resolveError}
            </p>
          )}
        </Modal>
      )}

      {/* SQL setup modal */}
      <Modal
        open={showSQL && configured}
        onClose={() => setShowSQL(false)}
        title="Supabase Database Setup SQL"
        size="lg"
        footer={<Button variant="secondary" onClick={() => setShowSQL(false)}>Close</Button>}
      >
        <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Run this SQL in your Supabase project under <strong>Database → SQL Editor → New Query</strong>.
          Only needs to be done once.
        </p>
        <pre className={styles.sqlBlock}>{SUPABASE_SETUP_SQL}</pre>
      </Modal>
    </div>
  )
}

const BULK_ACTION_LABELS: Record<'keep-local' | 'keep-cloud' | 'keep-newer', string> = {
  'keep-local': 'Mine',
  'keep-cloud': 'Cloud',
  'keep-newer': 'Newer',
}

function SyncResultDisplay({
  summary,
  onReviewDuplicate,
  onBulkResolve,
  showSummary = true,
}: {
  summary: SyncSummary
  onReviewDuplicate: (d: SyncDuplicate) => void
  onBulkResolve: (dups: SyncDuplicate[], action: 'keep-local' | 'keep-cloud' | 'keep-newer') => Promise<{ keptLocal: number; keptCloud: number }>
  // False for Household Sync, whose success/error text is now owned by the
  // shared OperationStatus component (see the "Household Sync" render
  // block above) — showing it twice would duplicate the same information
  // in two different visual styles. Family Share doesn't use OperationStatus
  // in this phase, so its call site leaves this at the default (true),
  // completely unchanged from before.
  showSummary?: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [resolving, setResolving] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ action: 'keep-local' | 'keep-cloud' | 'keep-newer'; count: number; keptLocal: number; keptCloud: number } | null>(null)

  const hasActivity = summary.addedLocally + summary.uploadedToCloud + summary.updatedToNewer > 0
  const hasErrors   = summary.errors.length > 0
  const dups        = summary.duplicatesForReview
  const hasDups     = dups.length > 0
  const allSelected = hasDups && selected.size === dups.length

  if (!showSummary && !hasDups && !bulkResult) return null

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(dups.map(d => d.localItem.id)))
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkAction(action: 'keep-local' | 'keep-cloud' | 'keep-newer') {
    const targets = selected.size > 0 ? dups.filter(d => selected.has(d.localItem.id)) : dups
    if (targets.length === 0 || resolving) return
    setResolving(true)
    try {
      const { keptLocal, keptCloud } = await onBulkResolve(targets, action)
      setSelected(new Set())
      setBulkResult({ action, count: targets.length, keptLocal, keptCloud })
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className={`${styles.syncResult} ${!hasErrors ? styles.syncResultOk : ''}`}>
      {showSummary && hasErrors && summary.errors.map((err, i) => (
        <p key={i} className={styles.syncError}>{err}</p>
      ))}
      {showSummary && !hasErrors && (
        <p className={styles.syncSuccess}>
          ✓ Sync complete —{' '}
          {summary.addedLocally} new {summary.addedLocally === 1 ? 'item' : 'items'} added from cloud,{' '}
          {summary.uploadedToCloud} {summary.uploadedToCloud === 1 ? 'item' : 'items'} uploaded,{' '}
          {summary.updatedToNewer} updated to newer version.
          {!hasActivity && !hasDups && !bulkResult && ' Everything is already up to date.'}
        </p>
      )}
      {bulkResult && (
        <p className={styles.syncSuccess}>
          ✓ {bulkResult.count} duplicate{bulkResult.count !== 1 ? 's' : ''} resolved using{' '}
          <strong>Keep {bulkResult.action === 'keep-newer' ? 'All Newer' : `All ${BULK_ACTION_LABELS[bulkResult.action]}`}</strong>
          {bulkResult.action === 'keep-newer'
            ? ` — ${bulkResult.keptLocal} kept local, ${bulkResult.keptCloud} kept cloud.`
            : bulkResult.action === 'keep-local' ? ' — kept your local version for all.' : ' — kept the cloud version for all.'}
        </p>
      )}
      {hasDups && (
        <div className={styles.dupList}>
          <p className={styles.dupSummaryLine}>
            {dups.length} duplicate{dups.length !== 1 ? 's' : ''} found — most are likely from one of the starter
            ingredient libraries (USDA basics or Great Value branded products) being loaded independently on
            multiple devices. Use Keep All Newer to resolve automatically.
          </p>

          <div className={styles.dupBulkBtnGroup}>
            <Button variant="secondary" size="sm" disabled={resolving} onClick={() => handleBulkAction('keep-local')}>
              {selected.size > 0 ? `Keep Mine (${selected.size})` : 'Keep All Mine'}
            </Button>
            <Button variant="secondary" size="sm" disabled={resolving} onClick={() => handleBulkAction('keep-cloud')}>
              {selected.size > 0 ? `Keep Cloud (${selected.size})` : 'Keep All Cloud'}
            </Button>
            <Button size="sm" disabled={resolving} onClick={() => handleBulkAction('keep-newer')}>
              {selected.size > 0 ? `Keep Newer (${selected.size})` : 'Keep All Newer'}
            </Button>
          </div>

          <label className={styles.dupSelectAllRow}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Select all duplicates"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>

          {dups.map(dup => (
            <div key={dup.localItem.id} className={styles.dupItem}>
              <input
                type="checkbox"
                checked={selected.has(dup.localItem.id)}
                onChange={() => toggleOne(dup.localItem.id)}
                aria-label={`Select ${(dup.localItem as Ingredient | Recipe).name}`}
              />
              {dup.type === 'ingredient' ? '🥕' : '📖'}{' '}
              <strong>{(dup.localItem as Ingredient | Recipe).name}</strong>
              <button className={styles.dupReviewLink} onClick={() => onReviewDuplicate(dup)}>Review →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
