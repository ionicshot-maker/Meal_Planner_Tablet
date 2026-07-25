import { useRef, useState } from 'react'
import { FileJson, Upload } from 'lucide-react'
import { Button, OperationStatus } from '@/components/ui'
import type { OperationState } from '@/components/ui'
import { getAllIngredients, saveIngredient } from '@/db/ingredients'
import { normalizeIngredient, extractRawIngredients, findIngredientMatch } from '@/utils/importNormalization'
import { now } from '@/utils/ids'
import type { Ingredient, IngredientVariant } from '@/types'
import styles from './JsonImportTab.module.css'

interface BrandCount { brand: string; count: number }

function computeBrandCounts(ingredients: Ingredient[]): BrandCount[] {
  const map = new Map<string, number>()
  for (const ing of ingredients) {
    const brand = ing.variants[0]?.brand || 'Generic'
    map.set(brand, (map.get(brand) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
}

interface ImportResult { added: number; updated: number; skipped: number }

type ImportMode = 'addNew' | 'addUpdate' | 'replace'

const IMPORT_MODES: { id: ImportMode; label: string; hint: string }[] = [
  { id: 'addNew',    label: 'Add New Only',         hint: 'Only add ingredients that don’t exist yet — skip everything else.' },
  { id: 'addUpdate', label: 'Add + Update Existing', hint: 'Add new ingredients, and update existing ones only if the imported data is newer.' },
  { id: 'replace',   label: 'Replace Existing',      hint: 'Add new ingredients, and overwrite matching existing ones unconditionally.' },
]

const BRAND_DISPLAY_LIMIT = 40
const PREVIEW_ITEM_LIMIT = 10

export function JsonImportTab() {
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null)
  const [brandCounts, setBrandCounts] = useState<BrandCount[]>([])
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<ImportMode>('addNew')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFileName('')
    setParseError('')
    setIngredients(null)
    setBrandCounts([])
    setSelectedBrands(new Set())
    setMode('addNew')
    setResult(null)
    setImportError('')
    setProgress({ done: 0, total: 0 })
  }

  function handleFile(file: File) {
    reset()
    if (!file.name.toLowerCase().endsWith('.json')) {
      setParseError('Please choose a .json file.')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string
        const data = JSON.parse(text)
        const raw = extractRawIngredients(data)
        const normalized = raw.map(normalizeIngredient).filter((x): x is Ingredient => x !== null)
        if (normalized.length === 0) {
          setParseError('No valid ingredients were found in this file.')
          return
        }
        setFileName(file.name)
        setIngredients(normalized)
        setBrandCounts(computeBrandCounts(normalized))
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Could not parse this file as JSON.')
      }
    }
    reader.onerror = () => setParseError('Could not read this file.')
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function toggleBrand(brand: string) {
    setSelectedBrands(prev => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  const toImport = !ingredients ? [] : selectedBrands.size === 0
    ? ingredients
    : ingredients.filter(i => selectedBrands.has(i.variants[0]?.brand || 'Generic'))

  // No wrapping transaction here — deliberately, not an oversight. Every 5
  // items the loop below yields via `await setTimeout(r, 0)` so the
  // progress bar actually repaints on a large file; empirically confirmed
  // (fake-indexeddb) that an open IndexedDB transaction does NOT survive
  // that yield — the next write throws TransactionInactiveError, since a
  // setTimeout callback runs in a later task than the one that opened the
  // transaction. Wrapping this loop in one transaction would either break
  // on the very next yield or require removing the progress-bar
  // responsiveness, a real regression on large imports. Each
  // saveIngredient() call already commits independently, which is also
  // what makes a mid-loop failure safe to retry: findIngredientMatch()
  // dedups by barcode/exact-name, so re-running the import after a
  // partial failure correctly skips everything already saved and picks up
  // where it left off, rather than creating duplicates.
  async function handleImport() {
    if (!ingredients || toImport.length === 0) return
    setImporting(true)
    setResult(null)
    setImportError('')
    setProgress({ done: 0, total: toImport.length })

    const existing = await getAllIngredients(true)
    const workingList = [...existing]
    const barcodeIndex = new Map<string, Ingredient>()
    for (const ing of workingList) {
      for (const v of ing.variants) if (v.barcode) barcodeIndex.set(v.barcode, ing)
    }

    let added = 0, updated = 0, skipped = 0

    try {
    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i]
      // fuzzy: false — findSmartMatches()'s keyword-subset check treats any
      // single/two-word name as a match for *any* existing name that merely
      // contains those same words (e.g. "Lime" matches "Cilantro Lime Rice",
      // "Key Lime Pie Filling", anything), and its edit-distance check can
      // match unrelated short words purely by character coincidence (e.g.
      // "Lime" vs "Rice", distance 2). Confirmed live: importing a 366-item
      // generic USDA set against a large mixed catalog produced a 100%
      // false-positive skip rate under fuzzy matching. brandedLibrary.ts
      // already disabled fuzzy for the same root cause (documented false-
      // positive rate importing 867 branded names against the much smaller
      // generic set) — this was the same bug, just never applied here.
      // Barcode + exact name are precise enough to catch real duplicates
      // (a re-run of the same import, an item already hand-added) without
      // the false-positive risk.
      const target = findIngredientMatch(item, workingList, barcodeIndex, { fuzzy: false })

      if (!target) {
        await saveIngredient(item)
        added++
        workingList.push(item)
        for (const v of item.variants) if (v.barcode) barcodeIndex.set(v.barcode, item)
      } else if (mode === 'addNew') {
        skipped++
      } else {
        const importedIsNewer = mode === 'replace' || !item.updatedAt || !target.updatedAt || item.updatedAt > target.updatedAt
        if (!importedIsNewer) {
          skipped++
        } else {
          const existingByBrand = new Map(target.variants.map(v => [v.brand.trim().toLowerCase(), v]))
          const existingByBarcode = new Map(
            target.variants.filter((v): v is IngredientVariant & { barcode: string } => !!v.barcode)
              .map(v => [v.barcode, v])
          )
          const nextVariants = [...target.variants]
          let changed = false

          for (const nv of item.variants) {
            const matchVariant = (nv.barcode && existingByBarcode.get(nv.barcode)) ?? existingByBrand.get(nv.brand.trim().toLowerCase())
            if (matchVariant) {
              const idx = nextVariants.findIndex(v => v.id === matchVariant.id)
              nextVariants[idx] = { ...nv, id: matchVariant.id, parentId: target.id }
            } else {
              nextVariants.push({ ...nv, parentId: target.id })
            }
            changed = true
          }

          if (!changed) {
            skipped++
          } else {
            target.variants = nextVariants
            target.updatedAt = now()
            await saveIngredient(target)
            updated++
            for (const v of nextVariants) if (v.barcode) barcodeIndex.set(v.barcode, target)
          }
        }
      }

      if (i % 5 === 0 || i === toImport.length - 1) {
        setProgress({ done: i + 1, total: toImport.length })
        // Yield periodically so the progress bar actually paints on large files
        await new Promise(r => setTimeout(r, 0))
      }
    }

    setResult({ added, updated, skipped })
    } catch (err) {
      // Not a rollback — everything counted above is genuinely already
      // saved (see the comment above this function for why this loop
      // can't be wrapped in one transaction). Report exactly what
      // completed rather than a blanket "import failed", and don't set
      // `result` — that would read as a clean finish. Retrying is safe:
      // findIngredientMatch()'s barcode/exact-name dedup means already-
      // imported items are recognized and skipped, not duplicated.
      setImportError(
        `Import stopped partway through: ${added} added, ${updated} updated, ${skipped} skipped before an error occurred. ` +
        `Everything counted above is already saved — nothing was rolled back. ` +
        `${err instanceof Error ? err.message : 'An unexpected error occurred.'} You can retry; already-imported items will be skipped, not duplicated.`
      )
    } finally {
      setImporting(false)
    }
  }

  // Derived, not separate state — importing/result/importError already fully
  // capture the lifecycle (result and importError already reset together at
  // the top of handleImport(), so they're never both set at once).
  const opState: OperationState = importing ? 'working' : result ? 'done' : importError ? 'failed' : 'idle'

  const displayedBrands = brandCounts.slice(0, BRAND_DISPLAY_LIMIT)
  const hiddenBrandCount = brandCounts.length - displayedBrands.length
  const previewItems = ingredients?.slice(0, PREVIEW_ITEM_LIMIT) ?? []
  const hiddenPreviewCount = ingredients ? ingredients.length - previewItems.length : 0

  return (
    <div className={styles.tab}>
      <div className={styles.body}>
        <p className={styles.desc}>
          Import a batch of ingredients from a JSON file — either a backup exported from
          Settings → Data → Export, or a file produced by an Open Food Facts bulk-converter tool.
        </p>

        {!ingredients && (
          <div
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <FileJson size={40} className={styles.dropZoneIcon} />
            <span className={styles.dropZoneText}>Drag and drop a JSON file here</span>
            <span className={styles.dropZoneHint}>or</span>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Browse file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleBrowse}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {parseError && <p className={styles.error}>{parseError}</p>}

        {ingredients && (
          <>
            <div className={styles.fileRow}>
              <span className={styles.fileName}>📄 {fileName}</span>
              {!importing && !result && (
                <button className={styles.changeFileBtn} onClick={reset}>Choose a different file</button>
              )}
            </div>

            <p className={styles.previewTitle}>
              Found {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''} in this file
            </p>

            {brandCounts.length > 0 && (
              <div className={styles.brandSection}>
                <div className={styles.brandHeaderRow}>
                  <span className={styles.brandLabel}>
                    Brand breakdown — tap to filter which brands to import
                  </span>
                  {selectedBrands.size > 0 && (
                    <div className={styles.brandQuickActions}>
                      <button className={styles.brandQuickBtn} onClick={() => setSelectedBrands(new Set())}>
                        Clear filter
                      </button>
                    </div>
                  )}
                </div>
                <div className={styles.brandChips}>
                  {displayedBrands.map(({ brand, count }) => (
                    <button
                      key={brand}
                      type="button"
                      className={`${styles.brandChip} ${selectedBrands.has(brand) ? styles.brandChipActive : ''}`}
                      onClick={() => toggleBrand(brand)}
                      disabled={importing || !!result}
                    >
                      {brand} ({count})
                    </button>
                  ))}
                  {hiddenBrandCount > 0 && (
                    <span className={styles.brandMore}>+{hiddenBrandCount} more brand{hiddenBrandCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            )}

            {!result && (
              <div className={styles.previewList}>
                <span className={styles.brandLabel}>Preview</span>
                <ul className={styles.previewItems}>
                  {previewItems.map((item, idx) => (
                    <li key={idx} className={styles.previewItem}>
                      <span className={styles.previewName}>{item.name}</span>
                      <span className={styles.previewMeta}>
                        {item.variants[0]?.brand ?? 'Generic'} · {Math.round(item.variants[0]?.macros?.calories ?? 0)} cal
                      </span>
                    </li>
                  ))}
                </ul>
                {hiddenPreviewCount > 0 && (
                  <span className={styles.brandMore}>+{hiddenPreviewCount} more ingredient{hiddenPreviewCount !== 1 ? 's' : ''} not shown</span>
                )}
              </div>
            )}

            {!importing && !result && (
              <div className={styles.modeSection}>
                <span className={styles.brandLabel}>Import mode</span>
                <div className={styles.modeOptions}>
                  {IMPORT_MODES.map(m => (
                    <label key={m.id} className={styles.modeOption}>
                      <input
                        type="radio"
                        name="jsonImportMode"
                        checked={mode === m.id}
                        onChange={() => setMode(m.id)}
                      />
                      <span>
                        <span className={styles.modeOptionLabel}>{m.label}</span>
                        <span className={styles.modeOptionHint}>{m.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <OperationStatus
              state={opState}
              progress={{ step: 'Importing ingredients', current: progress.done, total: progress.total }}
              doneMessage={result ? `${result.added} ingredient${result.added !== 1 ? 's' : ''} added, ${result.updated} updated, ${result.skipped} skipped as duplicates.` : undefined}
              errorMessage={importError || undefined}
              onDismiss={() => { if (importError) setImportError('') }}
            />
          </>
        )}
      </div>

      {ingredients && !result && (
        <div className={styles.footer}>
          {!importing && <Button variant="secondary" onClick={reset}>Cancel</Button>}
          <Button onClick={handleImport} disabled={importing || toImport.length === 0}>
            {importing
              ? 'Importing…'
              : selectedBrands.size === 0
                ? `Import All (${toImport.length})`
                : `Import Selected (${toImport.length})`}
          </Button>
        </div>
      )}

      {result && (
        <div className={styles.footer}>
          <Button variant="secondary" onClick={reset}>Import Another File</Button>
        </div>
      )}
    </div>
  )
}
