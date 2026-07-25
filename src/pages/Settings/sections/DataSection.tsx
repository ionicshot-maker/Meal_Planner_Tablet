import { useState, useEffect, ChangeEvent } from 'react'
import { Button, Card, Modal, OperationStatus } from '@/components/ui'
import type { OperationState, OperationProgress } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { getAllIngredients, getAllRecipes } from '@/db'
import { CloudSyncSection } from './CloudSyncSection'
import { loadSettings } from '@/db/settings'
import { getAllMealPlanTemplates, getPlannedDayCount } from '@/db/mealPlan'
import { getAllHouseholdItems } from '@/db/householdItems'
import { getMacroLogCount } from '@/db/macroLogs'
import { getDB } from '@/db/schema'
import { isNativeBackupFormat } from '@/utils/nativeBackupValidation'
import styles from './DataSection.module.css'

type ResetTarget = 'ingredients' | 'recipes' | 'mealPlan' | 'macroHistory' | 'groceryHistory' | 'everything'

const RESET_LABELS: Record<ResetTarget, string> = {
  ingredients:    'Ingredient Database',
  recipes:        'Cookbook & Recipes',
  mealPlan:       'Meal Plan',
  macroHistory:   'Macro History',
  groceryHistory: 'Grocery History',
  everything:     'Everything',
}

interface ImportPending {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any[]>
  ingredientConflicts: number
  recipeConflicts: number
}

interface LocalCounts {
  ingredients: number
  recipes: number
  plannedDays: number
  macroLogEntries: number
}

export function DataSection() {
  const { settings } = useSettings()
  const [confirmTarget, setConfirmTarget] = useState<ResetTarget | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importPending, setImportPending] = useState<ImportPending | null>(null)
  // importResult/importError now only ever come from two places, neither of
  // them the restore operation itself: performReset()'s own success message
  // (reused here rather than a 4th message state), and importData()'s
  // pre-flight file-validation rejections (bad format / invalid JSON) before
  // any restore operation has actually begun — those are instant synchronous
  // checks, not a long-running operation, so they stay on the existing
  // modal rather than OperationStatus. executeImport() itself — the actual
  // restore — reports through the dedicated importOp* state below instead.
  const [importResult, setImportResult] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  // Backup Import's shared status/progress surface — Phase 2 of
  // OPERATION_FEEDBACK_STANDARD.md. Reuses OperationStatus exactly as built
  // for Cloud Sync in Phase 1, no changes to that component.
  const [importOpState, setImportOpState] = useState<OperationState>('idle')
  const [importOpProgress, setImportOpProgress] = useState<OperationProgress | undefined>(undefined)
  const [importOpDoneMessage, setImportOpDoneMessage] = useState('')
  const [importOpErrorMessage, setImportOpErrorMessage] = useState('')
  const [resetting, setResetting] = useState(false)
  const [counts, setCounts] = useState<LocalCounts | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      const [ingredients, recipes, plannedDays, macroLogEntries] = await Promise.all([
        getAllIngredients(true).then(r => r.length),
        getAllRecipes(true).then(r => r.length),
        getPlannedDayCount(),
        getMacroLogCount(),
      ])
      if (!cancelled) setCounts({ ingredients, recipes, plannedDays, macroLogEntries })
    }
    loadCounts()
    return () => { cancelled = true }
    // Re-run after import/reset so the counts reflect what just changed —
    // importResult/importError only ever flip after those actions complete.
    // resetError included defensively even though a failed reset (now atomic)
    // shouldn't have changed anything. importOpState covers executeImport()
    // itself, which no longer touches importResult/importError (see above) —
    // re-runs on both 'done' and 'failed' for the same defensive reason.
  }, [importResult, importError, resetError, importOpState])

  function makeFilename(label: string) {
    const hn = settings.householdName.trim().replace(/\s+/g, '-')
    const date = new Date().toISOString().slice(0, 10)
    return hn ? `${hn}-${label}-Backup-${date}.json` : `${label}-Backup-${date}.json`
  }

  async function exportData(scope: 'ingredients' | 'cookbook' | 'full') {
    setExporting(true)
    try {
      const settingsData = await loadSettings()
      const db = await getDB()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = { exportedAt: new Date().toISOString(), scope, version: 1 }

      if (scope === 'ingredients' || scope === 'full') {
        data.ingredients = await getAllIngredients(true)
      }
      if (scope === 'cookbook' || scope === 'full') {
        data.recipes = await getAllRecipes(true)
      }
      if (scope === 'full') {
        data.settings       = settingsData
        data.mealPlanDays   = await db.getAll('mealPlanDays')
        data.mealPlanTemplates = await getAllMealPlanTemplates()
        data.macroLogs      = await db.getAll('macroLogs')
        data.groceryLists   = await db.getAll('groceryLists')
        data.householdItems = await getAllHouseholdItems()
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = makeFilename(scope === 'full' ? 'Full' : scope === 'cookbook' ? 'Cookbook' : 'Ingredients')
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function importData(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)

      if (!isNativeBackupFormat(parsed)) {
        setImportError(
          'This file does not appear to be a Meal Planner backup. For ingredient files from the ' +
          'Open Food Facts converter, use Import Ingredients → JSON Import tab instead.'
        )
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = parsed as Record<string, any[]>

      let ingredientConflicts = 0
      let recipeConflicts = 0

      if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
        const existing = await getAllIngredients(true)
        const existingIds = new Set(existing.map(i => i.id))
        ingredientConflicts = data.ingredients.filter((i: { id: string }) => existingIds.has(i.id)).length
      }
      if (Array.isArray(data.recipes) && data.recipes.length > 0) {
        const existing = await getAllRecipes(true)
        const existingIds = new Set(existing.map(r => r.id))
        recipeConflicts = data.recipes.filter((r: { id: string }) => existingIds.has(r.id)).length
      }

      if (ingredientConflicts > 0 || recipeConflicts > 0) {
        setImportPending({ data, ingredientConflicts, recipeConflicts })
      } else {
        await executeImport(data, 'skip')
      }
    } catch {
      setImportError('Import failed — the file appears to be an invalid backup. Make sure you are using a JSON file exported from this app.')
    }
  }

  // Genuinely atomic (2026-07-24 fix) — every store's writes below run
  // inside one shared db.transaction([...7 stores], 'readwrite'), the same
  // pattern as mergeIngredients()/applyReceiptSaveBatch()/performReset().
  // Previously each of the 7 data types was its own separate transaction:
  // internally atomic per type, but with nothing tying the 7 together, so
  // a failure on (say) the 4th type left the first 3 already committed
  // while the outer catch reported a blanket "Import failed" — genuinely
  // misleading, since real data had already changed. This function has no
  // UI-yield between writes (unlike JsonImportTab.tsx's progress-bar
  // pacing), so a single transaction is directly supported by the
  // platform, and "restore this backup" is a case where all-or-nothing is
  // the right semantics — a partially-applied backup restore is a worse
  // outcome than either a clean success or a clean no-op, unlike starter-
  // library seeding where a partial result is still useful. Reads (for the
  // skip-strategy dedup check) now go through the SAME transaction's store
  // handles instead of the separate getAllIngredients()/getAllRecipes()
  // helpers, so the whole operation — reads included — is one consistent
  // unit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function executeImport(data: Record<string, any[]>, strategy: 'skip' | 'overwrite') {
    setImportPending(null)
    setImportError(null)
    // Flips synchronously, before the first await — same 200-300ms
    // immediate-feedback requirement as Cloud Sync's Phase 1 wiring.
    setImportOpState('working')
    setImportOpProgress(undefined)

    const db = await getDB()
    const stores: ('ingredients' | 'recipes' | 'mealPlanDays' | 'mealPlanTemplates' | 'macroLogs' | 'groceryLists' | 'householdItems')[] =
      ['ingredients', 'recipes', 'mealPlanDays', 'mealPlanTemplates', 'macroLogs', 'groceryLists', 'householdItems']
    const tx = db.transaction(stores, 'readwrite')
    const messages: string[] = []

    // Progress reporting is a plain synchronous callback (no await inside) —
    // empirically verified via fake-indexeddb before this was wired in that
    // this does NOT break the open transaction the way an `await
    // setTimeout(0)` yield does (the exact mechanism that ruled out a shared
    // transaction for JsonImportTab.tsx's loop). Reported per-item across
    // all 7 stores, uniformly, mirroring runSync()'s Phase 1 pattern.
    function report(step: string, current: number, total: number) {
      setImportOpProgress({ step, current, total })
    }

    try {
      if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
        const existingIds = new Set((await tx.objectStore('ingredients').getAllKeys()) as string[])
        const toAdd = strategy === 'skip'
          ? data.ingredients.filter((i: { id: string }) => !existingIds.has(i.id))
          : data.ingredients
        report('Importing ingredients', 0, toAdd.length)
        let i = 0
        for (const item of toAdd) { await tx.objectStore('ingredients').put(item); report('Importing ingredients', ++i, toAdd.length) }
        messages.push(`${toAdd.length} ingredient${toAdd.length !== 1 ? 's' : ''} imported`)
      }

      if (Array.isArray(data.recipes) && data.recipes.length > 0) {
        const existingIds = new Set((await tx.objectStore('recipes').getAllKeys()) as string[])
        const toAdd = strategy === 'skip'
          ? data.recipes.filter((r: { id: string }) => !existingIds.has(r.id))
          : data.recipes
        report('Importing recipes', 0, toAdd.length)
        let i = 0
        for (const item of toAdd) { await tx.objectStore('recipes').put(item); report('Importing recipes', ++i, toAdd.length) }
        messages.push(`${toAdd.length} recipe${toAdd.length !== 1 ? 's' : ''} imported`)
      }

      if (Array.isArray(data.mealPlanDays) && data.mealPlanDays.length > 0) {
        report('Importing meal plan days', 0, data.mealPlanDays.length)
        let i = 0
        for (const item of data.mealPlanDays) { await tx.objectStore('mealPlanDays').put(item); report('Importing meal plan days', ++i, data.mealPlanDays.length) }
        messages.push(`${data.mealPlanDays.length} meal plan days imported`)
      }
      if (Array.isArray(data.mealPlanTemplates) && data.mealPlanTemplates.length > 0) {
        report('Importing meal plan templates', 0, data.mealPlanTemplates.length)
        let i = 0
        for (const item of data.mealPlanTemplates) { await tx.objectStore('mealPlanTemplates').put(item); report('Importing meal plan templates', ++i, data.mealPlanTemplates.length) }
        messages.push(`${data.mealPlanTemplates.length} template${data.mealPlanTemplates.length !== 1 ? 's' : ''} imported`)
      }
      if (Array.isArray(data.macroLogs) && data.macroLogs.length > 0) {
        report('Importing macro log entries', 0, data.macroLogs.length)
        let i = 0
        for (const item of data.macroLogs) { await tx.objectStore('macroLogs').put(item); report('Importing macro log entries', ++i, data.macroLogs.length) }
        messages.push(`${data.macroLogs.length} macro log entries imported`)
      }
      if (Array.isArray(data.groceryLists) && data.groceryLists.length > 0) {
        report('Importing grocery lists', 0, data.groceryLists.length)
        let i = 0
        for (const item of data.groceryLists) { await tx.objectStore('groceryLists').put(item); report('Importing grocery lists', ++i, data.groceryLists.length) }
        messages.push(`${data.groceryLists.length} grocery list${data.groceryLists.length !== 1 ? 's' : ''} imported`)
      }
      if (Array.isArray(data.householdItems) && data.householdItems.length > 0) {
        report('Importing household items', 0, data.householdItems.length)
        let i = 0
        for (const item of data.householdItems) { await tx.objectStore('householdItems').put(item); report('Importing household items', ++i, data.householdItems.length) }
        messages.push(`${data.householdItems.length} household item${data.householdItems.length !== 1 ? 's' : ''} imported`)
      }

      await tx.done

      setImportOpDoneMessage(
        messages.length > 0
          ? messages.join(', ') + '.'
          : 'Nothing to import — the file may be empty or already up to date.'
      )
      setImportOpState('done')
    } catch (err) {
      try { tx.abort() } catch { /* transaction already finished */ }
      tx.done.catch(() => {})
      setImportOpErrorMessage(
        `Import failed before any changes were made — nothing was written. This is all-or-nothing: a failure partway through leaves your data exactly as it was before. ` +
        `${err instanceof Error ? err.message : 'An unexpected error occurred.'} Please try again.`
      )
      setImportOpState('failed')
    }
  }

  type StoreName = 'ingredients' | 'recipes' | 'mealPlanDays' | 'mealPlanTemplates' | 'macroLogs' | 'groceryLists' | 'householdItems'

  // Genuinely atomic (2026-07-24 fix) — every target store is cleared in one
  // shared IndexedDB transaction, not N independent db.clear() calls. If any
  // clear() in the loop throws, the transaction aborts and every store in
  // it — including ones already cleared earlier in the loop — rolls back
  // automatically; nothing is left partially reset. Previously this had zero
  // error handling of any kind: a failure partway through could silently
  // leave some stores cleared and others untouched, with no message shown
  // (2026-07-24 audit finding). "Reset X" is genuinely all-or-nothing now,
  // not just sequential-with-better-reporting.
  async function performReset(target: ResetTarget) {
    const allStores: StoreName[] = ['ingredients', 'recipes', 'mealPlanDays', 'mealPlanTemplates', 'macroLogs', 'groceryLists', 'householdItems']
    const storeMap: Record<Exclude<ResetTarget, 'everything'>, StoreName[]> = {
      ingredients:    ['ingredients'],
      recipes:        ['recipes'],
      mealPlan:       ['mealPlanDays', 'mealPlanTemplates'],
      macroHistory:   ['macroLogs'],
      groceryHistory: ['groceryLists'],
    }
    const stores = target === 'everything' ? allStores : storeMap[target]

    setResetting(true)
    setResetError(null)
    try {
      const db = await getDB()
      const tx = db.transaction(stores, 'readwrite')
      for (const store of stores) await tx.objectStore(store).clear()
      await tx.done
      setConfirmTarget(null)
      setImportResult(`${RESET_LABELS[target]} has been reset.`)
    } catch (err) {
      setConfirmTarget(null)
      setResetError(
        `Could not reset ${RESET_LABELS[target]}: ${err instanceof Error ? err.message : String(err)}. ` +
        `Nothing was changed — this reset is all-or-nothing, so a failure partway through leaves your data exactly as it was before.`
      )
    } finally {
      setResetting(false)
    }
  }

  const RESET_OPTIONS: ResetTarget[] = ['ingredients', 'recipes', 'mealPlan', 'macroHistory', 'groceryHistory', 'everything']

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Data</h2>

      {/* Local data counts — meant to make a stale/partial sync between devices
          obvious at a glance instead of requiring a deep debugging session. */}
      {counts && (
        <p className={styles.localCounts}>
          On this device: {counts.ingredients} {counts.ingredients === 1 ? 'ingredient' : 'ingredients'} ·{' '}
          {counts.recipes} {counts.recipes === 1 ? 'recipe' : 'recipes'} ·{' '}
          {counts.plannedDays} meal plan {counts.plannedDays === 1 ? 'day' : 'days'} planned ·{' '}
          {counts.macroLogEntries} macro log {counts.macroLogEntries === 1 ? 'entry' : 'entries'} (not synced)
        </p>
      )}

      {/* Cloud Sync */}
      <CloudSyncSection />

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-4) 0' }} />

      {/* Export */}
      <h3 className={styles.subTitle}>Export</h3>
      <Card>
        <div className={styles.exportGroup}>
          <Button variant="secondary" onClick={() => exportData('ingredients')} disabled={exporting}>
            Export Ingredients
          </Button>
          <Button variant="secondary" onClick={() => exportData('cookbook')} disabled={exporting}>
            Export Cookbook
          </Button>
          <Button variant="secondary" onClick={() => exportData('full')} disabled={exporting}>
            Export Full Backup
          </Button>
        </div>
        <p className={styles.hint}>
          JSON format. Full backup includes settings, ingredients, recipes, meal plans, macro history,
          grocery lists, and household items. The file is named with your household name and today's date.
        </p>
      </Card>

      {/* Import */}
      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Import</h3>
      <Card>
        <p className={styles.desc}>
          Restore from a previously exported JSON backup. Meal plan data, macro logs, and grocery
          history are merged automatically. For ingredients and recipes you will be asked how to
          handle any duplicates.
        </p>
        <label className={`${styles.importLabel} ${importOpState === 'working' ? styles.importLabelDisabled : ''}`}>
          <span className={styles.importBtn}>Choose File</span>
          <input type="file" accept=".json" onChange={importData} className={styles.fileInput} disabled={importOpState === 'working'} />
        </label>

        <OperationStatus
          state={importOpState}
          progress={importOpProgress}
          doneMessage={importOpDoneMessage}
          errorMessage={importOpErrorMessage}
          onDismiss={() => setImportOpState('idle')}
          reassuranceMessage="Large backups can take a little while to restore — this won't interrupt itself partway through."
        />
      </Card>

      {/* Reset */}
      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Reset</h3>
      <p className={styles.desc}>Permanently delete data. These actions cannot be undone.</p>
      <Card>
        <div className={styles.resetGroup}>
          {RESET_OPTIONS.map(target => (
            <Button
              key={target}
              variant={target === 'everything' ? 'danger' : 'secondary'}
              size="sm"
              disabled={resetting}
              onClick={() => setConfirmTarget(target)}
            >
              Reset {RESET_LABELS[target]}
            </Button>
          ))}
        </div>
      </Card>

      {/* Reset confirm modal */}
      {confirmTarget && (
        <Modal
          open
          onClose={() => setConfirmTarget(null)}
          title="Confirm Reset"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmTarget(null)} disabled={resetting}>Cancel</Button>
              <Button variant="danger" onClick={() => performReset(confirmTarget)} disabled={resetting}>
                {resetting ? 'Resetting…' : `Reset ${RESET_LABELS[confirmTarget]}`}
              </Button>
            </>
          }
        >
          <p>
            Are you sure you want to reset <strong>{RESET_LABELS[confirmTarget]}</strong>?
            This will permanently delete all data in that section and cannot be undone.
          </p>
        </Modal>
      )}

      {/* Import conflict modal */}
      {importPending && (
        <Modal
          open
          onClose={() => setImportPending(null)}
          title="Duplicate Items Found"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setImportPending(null)}>Cancel</Button>
              <Button variant="secondary" onClick={() => executeImport(importPending.data, 'skip')}>
                Skip Duplicates
              </Button>
              <Button variant="danger" onClick={() => executeImport(importPending.data, 'overwrite')}>
                Overwrite Existing
              </Button>
            </>
          }
        >
          <p style={{ marginBottom: 'var(--space-3)' }}>
            The backup file contains items that already exist in your database:
          </p>
          <ul style={{ marginLeft: 'var(--space-5)', lineHeight: 1.8 }}>
            {importPending.ingredientConflicts > 0 && (
              <li>
                {importPending.ingredientConflicts} ingredient{importPending.ingredientConflicts !== 1 ? 's' : ''} already exist
              </li>
            )}
            {importPending.recipeConflicts > 0 && (
              <li>
                {importPending.recipeConflicts} recipe{importPending.recipeConflicts !== 1 ? 's' : ''} already exist
              </li>
            )}
          </ul>
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            <strong>Skip duplicates</strong> — keep your existing versions and only import new items.<br />
            <strong>Overwrite existing</strong> — replace your current items with the ones from the backup.
          </p>
        </Modal>
      )}

      {/* Result / error modal — shared by import and reset outcomes */}
      {(importResult !== null || importError !== null || resetError !== null) && (
        <Modal
          open
          onClose={() => { setImportResult(null); setImportError(null); setResetError(null) }}
          title={importError ? 'Import Failed' : resetError ? 'Reset Failed' : 'Done'}
          size="sm"
          footer={
            <Button variant="secondary" onClick={() => { setImportResult(null); setImportError(null); setResetError(null) }}>
              OK
            </Button>
          }
        >
          <p style={{ color: (importError || resetError) ? 'var(--color-danger)' : undefined }}>
            {importResult ?? importError ?? resetError}
          </p>
        </Modal>
      )}
    </div>
  )
}
