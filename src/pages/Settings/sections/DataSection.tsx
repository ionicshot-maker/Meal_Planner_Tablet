import { useState, ChangeEvent } from 'react'
import { Button, Card, Modal } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { getAllIngredients, getAllRecipes } from '@/db'
import { loadSettings } from '@/db/settings'
import { getAllMealPlanTemplates } from '@/db/mealPlan'
import { getAllHouseholdItems } from '@/db/householdItems'
import { getDB } from '@/db/schema'
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

export function DataSection() {
  const { settings } = useSettings()
  const [confirmTarget, setConfirmTarget] = useState<ResetTarget | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importPending, setImportPending] = useState<ImportPending | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(text) as Record<string, any[]>

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function executeImport(data: Record<string, any[]>, strategy: 'skip' | 'overwrite') {
    setImportPending(null)
    try {
      const db = await getDB()
      const messages: string[] = []

      if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
        const existing = await getAllIngredients(true)
        const existingIds = new Set(existing.map(i => i.id))
        const toAdd = strategy === 'skip'
          ? data.ingredients.filter((i: { id: string }) => !existingIds.has(i.id))
          : data.ingredients
        if (toAdd.length > 0) {
          const tx = db.transaction('ingredients', 'readwrite')
          for (const item of toAdd) await tx.store.put(item)
          await tx.done
        }
        messages.push(`${toAdd.length} ingredient${toAdd.length !== 1 ? 's' : ''} imported`)
      }

      if (Array.isArray(data.recipes) && data.recipes.length > 0) {
        const existing = await getAllRecipes(true)
        const existingIds = new Set(existing.map(r => r.id))
        const toAdd = strategy === 'skip'
          ? data.recipes.filter((r: { id: string }) => !existingIds.has(r.id))
          : data.recipes
        if (toAdd.length > 0) {
          const tx = db.transaction('recipes', 'readwrite')
          for (const item of toAdd) await tx.store.put(item)
          await tx.done
        }
        messages.push(`${toAdd.length} recipe${toAdd.length !== 1 ? 's' : ''} imported`)
      }

      if (Array.isArray(data.mealPlanDays) && data.mealPlanDays.length > 0) {
        const tx = db.transaction('mealPlanDays', 'readwrite')
        for (const item of data.mealPlanDays) await tx.store.put(item)
        await tx.done
        messages.push(`${data.mealPlanDays.length} meal plan days imported`)
      }
      if (Array.isArray(data.mealPlanTemplates) && data.mealPlanTemplates.length > 0) {
        const tx = db.transaction('mealPlanTemplates', 'readwrite')
        for (const item of data.mealPlanTemplates) await tx.store.put(item)
        await tx.done
        messages.push(`${data.mealPlanTemplates.length} template${data.mealPlanTemplates.length !== 1 ? 's' : ''} imported`)
      }
      if (Array.isArray(data.macroLogs) && data.macroLogs.length > 0) {
        const tx = db.transaction('macroLogs', 'readwrite')
        for (const item of data.macroLogs) await tx.store.put(item)
        await tx.done
        messages.push(`${data.macroLogs.length} macro log entries imported`)
      }
      if (Array.isArray(data.groceryLists) && data.groceryLists.length > 0) {
        const tx = db.transaction('groceryLists', 'readwrite')
        for (const item of data.groceryLists) await tx.store.put(item)
        await tx.done
        messages.push(`${data.groceryLists.length} grocery list${data.groceryLists.length !== 1 ? 's' : ''} imported`)
      }
      if (Array.isArray(data.householdItems) && data.householdItems.length > 0) {
        const tx = db.transaction('householdItems', 'readwrite')
        for (const item of data.householdItems) await tx.store.put(item)
        await tx.done
        messages.push(`${data.householdItems.length} household item${data.householdItems.length !== 1 ? 's' : ''} imported`)
      }

      setImportResult(
        messages.length > 0
          ? messages.join(', ') + '.'
          : 'Nothing to import — the file may be empty or already up to date.'
      )
    } catch {
      setImportError('Import failed — could not write to the database. Please try again.')
    }
  }

  type StoreName = 'ingredients' | 'recipes' | 'mealPlanDays' | 'mealPlanTemplates' | 'macroLogs' | 'groceryLists' | 'householdItems'

  async function performReset(target: ResetTarget) {
    const db = await getDB()
    const allStores: StoreName[] = ['ingredients', 'recipes', 'mealPlanDays', 'mealPlanTemplates', 'macroLogs', 'groceryLists', 'householdItems']
    const storeMap: Record<Exclude<ResetTarget, 'everything'>, StoreName[]> = {
      ingredients:    ['ingredients'],
      recipes:        ['recipes'],
      mealPlan:       ['mealPlanDays', 'mealPlanTemplates'],
      macroHistory:   ['macroLogs'],
      groceryHistory: ['groceryLists'],
    }
    const stores = target === 'everything' ? allStores : storeMap[target]
    for (const store of stores) await db.clear(store)
    setConfirmTarget(null)
    setImportResult(`${RESET_LABELS[target]} has been reset.`)
  }

  const RESET_OPTIONS: ResetTarget[] = ['ingredients', 'recipes', 'mealPlan', 'macroHistory', 'groceryHistory', 'everything']

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Data</h2>

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
        <label className={styles.importLabel}>
          <span className={styles.importBtn}>Choose File</span>
          <input type="file" accept=".json" onChange={importData} className={styles.fileInput} />
        </label>
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
              <Button variant="secondary" onClick={() => setConfirmTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => performReset(confirmTarget)}>
                Reset {RESET_LABELS[confirmTarget]}
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

      {/* Result / error modal */}
      {(importResult !== null || importError !== null) && (
        <Modal
          open
          onClose={() => { setImportResult(null); setImportError(null) }}
          title={importError ? 'Import Failed' : 'Done'}
          size="sm"
          footer={
            <Button variant="secondary" onClick={() => { setImportResult(null); setImportError(null) }}>
              OK
            </Button>
          }
        >
          <p style={{ color: importError ? 'var(--color-danger)' : undefined }}>
            {importResult ?? importError}
          </p>
        </Modal>
      )}
    </div>
  )
}
