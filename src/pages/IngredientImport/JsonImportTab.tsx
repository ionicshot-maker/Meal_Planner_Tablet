import { useRef, useState } from 'react'
import { FileJson, Upload } from 'lucide-react'
import { Button } from '@/components/ui'
import { getAllIngredients, saveIngredient } from '@/db/ingredients'
import { findSmartMatches } from '@/utils/smartDuplicate'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientVariant, IngredientUnit, Macros, NutriscoreGrade, NovaGroupNum } from '@/types'
import styles from './JsonImportTab.module.css'

// ─── Loosely-typed shapes for the two accepted JSON formats ───────────────────
// 1. This app's own Settings → Data → Export format: variants already carry a
//    nested `macros` object matching our IngredientVariant shape.
// 2. An Open Food Facts bulk-converter format: variants carry flat macro
//    fields (calories, protein, ...) plus renamed fields like
//    `storePreference` / `packageServings` instead of `store` / `totalServingsInPackage`.
interface RawVariant {
  id?: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  defaultUnit?: string
  macros?: Macros
  calories?: number
  protein?: number
  carbs?: number
  fiber?: number
  sugar?: number
  fat?: number
  saturatedFat?: number | null
  transFat?: number | null
  sodium?: number
  packageCost?: number | null
  totalServingsInPackage?: number | null
  packageServings?: number | null
  costPerServing?: number | null
  store?: string | null
  storePreference?: string | null
  usdaFdcId?: number | null
  notes?: string | null
  nutriscore?: string | null
  novaGroup?: number | null
  allergens?: string[] | null
  perishable?: boolean
  frozen?: boolean
  alwaysOnHand?: boolean
}

interface RawIngredient {
  id?: string
  name?: string
  category?: string
  perishable?: boolean
  frozen?: boolean
  alwaysOnHand?: boolean
  archived?: boolean
  createdAt?: string
  updatedAt?: string
  defaultVariantId?: string
  variants?: RawVariant[]
}

const NUTRISCORE_GRADES = new Set(['A', 'B', 'C', 'D', 'E'])

function normalizeVariant(rv: RawVariant, parentId: string): IngredientVariant {
  const macros: Macros = rv.macros ?? {
    calories: rv.calories ?? 0,
    protein: rv.protein ?? 0,
    carbs: rv.carbs ?? 0,
    fiber: rv.fiber ?? 0,
    sugar: rv.sugar ?? 0,
    fat: rv.fat ?? 0,
    sodium: rv.sodium ?? 0,
    ...(rv.saturatedFat != null ? { saturatedFat: rv.saturatedFat } : {}),
    ...(rv.transFat != null ? { transFat: rv.transFat } : {}),
  }
  const totalServingsInPackage = rv.totalServingsInPackage ?? rv.packageServings ?? undefined
  const store = rv.store ?? rv.storePreference ?? undefined
  const nutriscoreRaw = rv.nutriscore?.toUpperCase()
  const nutriscore = nutriscoreRaw && NUTRISCORE_GRADES.has(nutriscoreRaw) ? (nutriscoreRaw as NutriscoreGrade) : undefined
  const novaGroup = rv.novaGroup != null && rv.novaGroup >= 1 && rv.novaGroup <= 4 ? (rv.novaGroup as NovaGroupNum) : undefined

  return {
    id: rv.id || newId(),
    parentId,
    brand: rv.brand?.trim() || 'Generic',
    defaultUnit: (rv.defaultUnit || rv.servingUnit || 'g') as IngredientUnit,
    servingSize: rv.servingSize ?? 100,
    servingUnit: (rv.servingUnit || rv.defaultUnit || 'g') as IngredientUnit,
    macros,
    ...(rv.packageCost != null ? { packageCost: rv.packageCost } : {}),
    ...(totalServingsInPackage != null ? { totalServingsInPackage } : {}),
    ...(rv.costPerServing != null ? { costPerServing: rv.costPerServing } : {}),
    ...(rv.usdaFdcId != null ? { usdaFdcId: rv.usdaFdcId } : {}),
    ...(store ? { store } : {}),
    ...(rv.notes ? { notes: rv.notes } : {}),
    ...(rv.barcode ? { barcode: rv.barcode } : {}),
    ...(nutriscore ? { nutriscore } : {}),
    ...(novaGroup ? { novaGroup } : {}),
    ...(rv.allergens && rv.allergens.length > 0 ? { allergens: rv.allergens } : {}),
  }
}

function normalizeIngredient(raw: RawIngredient): Ingredient | null {
  const name = raw.name?.trim()
  if (!name || !Array.isArray(raw.variants) || raw.variants.length === 0) return null

  const id = raw.id || newId()
  const variants = raw.variants.map(v => normalizeVariant(v, id))
  const first = raw.variants[0]

  return {
    id,
    name,
    category: raw.category || 'Pantry',
    perishable: raw.perishable ?? first.perishable ?? false,
    frozen: raw.frozen ?? first.frozen ?? false,
    alwaysOnHand: raw.alwaysOnHand ?? first.alwaysOnHand ?? false,
    archived: raw.archived ?? false,
    variants,
    defaultVariantId: raw.defaultVariantId && variants.some(v => v.id === raw.defaultVariantId)
      ? raw.defaultVariantId
      : variants[0].id,
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || now(),
  }
}

function extractRawIngredients(data: unknown): RawIngredient[] {
  if (Array.isArray(data)) return data as RawIngredient[]
  if (data && typeof data === 'object' && Array.isArray((data as { ingredients?: unknown }).ingredients)) {
    return (data as { ingredients: RawIngredient[] }).ingredients
  }
  throw new Error('Could not find an "ingredients" list in this file. Make sure it is a JSON export from Settings → Data or an Open Food Facts converter file.')
}

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

const BRAND_DISPLAY_LIMIT = 40

export function JsonImportTab() {
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null)
  const [brandCounts, setBrandCounts] = useState<BrandCount[]>([])
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<ImportResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFileName('')
    setParseError('')
    setIngredients(null)
    setBrandCounts([])
    setSelectedBrands(new Set())
    setResult(null)
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

  async function handleImport() {
    if (!ingredients || toImport.length === 0) return
    setImporting(true)
    setResult(null)
    setProgress({ done: 0, total: toImport.length })

    const existing = await getAllIngredients(true)
    const workingList = [...existing]
    const barcodeIndex = new Map<string, Ingredient>()
    for (const ing of workingList) {
      for (const v of ing.variants) if (v.barcode) barcodeIndex.set(v.barcode, ing)
    }

    let added = 0, updated = 0, skipped = 0

    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i]
      const itemBarcodes = item.variants.map(v => v.barcode).filter((b): b is string => !!b)
      const barcodeDup = itemBarcodes.some(b => barcodeIndex.has(b))

      if (barcodeDup) {
        skipped++
      } else {
        const matches = findSmartMatches(item.name, workingList)
        if (matches.length > 0) {
          const target = matches[0]
          const existingBrands = new Set(target.variants.map(v => v.brand.trim().toLowerCase()))
          const newVariants = item.variants
            .filter(v => !existingBrands.has(v.brand.trim().toLowerCase()))
            .map(v => ({ ...v, parentId: target.id }))

          if (newVariants.length === 0) {
            skipped++
          } else {
            target.variants = [...target.variants, ...newVariants]
            target.updatedAt = now()
            await saveIngredient(target)
            updated++
            for (const v of newVariants) if (v.barcode) barcodeIndex.set(v.barcode, target)
          }
        } else {
          await saveIngredient(item)
          added++
          workingList.push(item)
          for (const v of item.variants) if (v.barcode) barcodeIndex.set(v.barcode, item)
        }
      }

      if (i % 5 === 0 || i === toImport.length - 1) {
        setProgress({ done: i + 1, total: toImport.length })
        // Yield periodically so the progress bar actually paints on large files
        await new Promise(r => setTimeout(r, 0))
      }
    }

    setResult({ added, updated, skipped })
    setImporting(false)
  }

  const displayedBrands = brandCounts.slice(0, BRAND_DISPLAY_LIMIT)
  const hiddenBrandCount = brandCounts.length - displayedBrands.length

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

            {importing && (
              <div className={styles.progressWrap}>
                <span className={styles.progressLabel}>
                  Importing… {progress.done} / {progress.total}
                </span>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {result && (
              <div className={styles.resultCard}>
                <span className={styles.resultTitle}>Import complete</span>
                <span className={styles.resultStats}>
                  {result.added} ingredient{result.added !== 1 ? 's' : ''} added,{' '}
                  {result.updated} updated with new variants,{' '}
                  {result.skipped} skipped as duplicates
                </span>
              </div>
            )}
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
