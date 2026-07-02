import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Card, Input, Select, Modal } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import {
  runSync, runFamilyShareSync, generateSyncCode,
  isSupabaseConfigured, SUPABASE_SETUP_SQL,
  resolveIngredientDuplicate, resolveRecipeDuplicate,
  type SyncSummary, type SyncDuplicate,
} from '@/db/supabase'
import type { FamilyShareRole, Ingredient, Recipe } from '@/types'
import styles from './CloudSyncSection.module.css'

type SyncDirection = 'both' | 'push' | 'pull'

export function CloudSyncSection() {
  const { settings, updateSettings, reloadSettings } = useSettings()
  const [syncing, setSyncing] = useState(false)
  const [familySyncing, setFamilySyncing] = useState(false)
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [familySummary, setFamilySummary] = useState<SyncSummary | null>(null)
  const [showSQL, setShowSQL] = useState(false)
  const [dupToResolve, setDupToResolve] = useState<SyncDuplicate | null>(null)

  const configured = isSupabaseConfigured(settings)

  async function handleSync(direction: SyncDirection) {
    setSyncing(true)
    setSummary(null)
    try {
      const result = await runSync(settings, direction)
      setSummary(result)
      // Settings may have been written directly to IndexedDB during sync — refresh context state
      await reloadSettings()
    } catch (e) {
      setSummary({ addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [], errors: [String(e)] })
    } finally {
      setSyncing(false)
    }
  }

  async function handleFamilySync(direction: SyncDirection) {
    setFamilySyncing(true)
    setFamilySummary(null)
    try {
      const result = await runFamilyShareSync(settings, direction)
      setFamilySummary(result)
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

  async function handleResolveDuplicate(action: 'keep-local' | 'keep-cloud' | 'keep-both') {
    if (!dupToResolve) return
    if (dupToResolve.type === 'ingredient') {
      await resolveIngredientDuplicate(action, dupToResolve as SyncDuplicate & { type: 'ingredient' })
    } else {
      await resolveRecipeDuplicate(action, dupToResolve as SyncDuplicate & { type: 'recipe' })
    }
    // Remove from the pending list
    if (summary) {
      setSummary({
        ...summary,
        duplicatesForReview: summary.duplicatesForReview.filter(d => d !== dupToResolve),
      })
    }
    setDupToResolve(null)
  }

  async function resolveOne(dup: SyncDuplicate, action: 'keep-local' | 'keep-cloud' | 'keep-newer'): Promise<'keep-local' | 'keep-cloud'> {
    const resolvedAction: 'keep-local' | 'keep-cloud' = action === 'keep-newer'
      ? (new Date(dup.cloudItem.updatedAt).getTime() > new Date(dup.localItem.updatedAt).getTime() ? 'keep-cloud' : 'keep-local')
      : action
    if (dup.type === 'ingredient') {
      await resolveIngredientDuplicate(resolvedAction, dup as SyncDuplicate & { type: 'ingredient' })
    } else {
      await resolveRecipeDuplicate(resolvedAction, dup as SyncDuplicate & { type: 'recipe' })
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
      for (const dup of dups) {
        const resolvedAction = await resolveOne(dup, action)
        if (resolvedAction === 'keep-local') keptLocal++
        else keptCloud++
      }
      const resolvedSet = new Set(dups)
      setSummaryState(prev => prev && {
        ...prev,
        duplicatesForReview: prev.duplicatesForReview.filter(d => !resolvedSet.has(d)),
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

      {/* ── Household Sync ─────────────────────────────────────────── */}
      <h3 className={styles.subTitle}>Household Sync</h3>
      <p className={styles.desc}>
        Sync everything between your devices — ingredients, recipes, recipe collections, meal plans,
        grocery lists, household items, and settings. Use the same code on every device in your home.
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

        {summary && <SyncResultDisplay summary={summary} onReviewDuplicate={setDupToResolve} onBulkResolve={bulkResolveHousehold} />}
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

        {familySummary && <SyncResultDisplay summary={familySummary} onReviewDuplicate={setDupToResolve} onBulkResolve={bulkResolveFamily} />}
      </Card>

      {/* ── Duplicate review modal ─────────────────────────────────── */}
      {dupToResolve && (
        <Modal
          open
          onClose={() => setDupToResolve(null)}
          title="Duplicate Found"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDupToResolve(null)}>Skip</Button>
              <Button variant="secondary" onClick={() => handleResolveDuplicate('keep-local')}>Keep Mine</Button>
              <Button variant="secondary" onClick={() => handleResolveDuplicate('keep-both')}>Keep Both</Button>
              <Button onClick={() => handleResolveDuplicate('keep-cloud')}>Keep Theirs</Button>
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
}: {
  summary: SyncSummary
  onReviewDuplicate: (d: SyncDuplicate) => void
  onBulkResolve: (dups: SyncDuplicate[], action: 'keep-local' | 'keep-cloud' | 'keep-newer') => Promise<{ keptLocal: number; keptCloud: number }>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [resolving, setResolving] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ action: 'keep-local' | 'keep-cloud' | 'keep-newer'; count: number; keptLocal: number; keptCloud: number } | null>(null)

  const hasActivity = summary.addedLocally + summary.uploadedToCloud + summary.updatedToNewer > 0
  const hasErrors   = summary.errors.length > 0
  const dups        = summary.duplicatesForReview
  const hasDups     = dups.length > 0
  const allSelected = hasDups && selected.size === dups.length

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
      {hasErrors && summary.errors.map((err, i) => (
        <p key={i} className={styles.syncError}>{err}</p>
      ))}
      {!hasErrors && (
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
            {dups.length} duplicate{dups.length !== 1 ? 's' : ''} found — most are likely from the starter ingredient
            library seeding on multiple devices. Use Keep All Newer to resolve automatically.
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
