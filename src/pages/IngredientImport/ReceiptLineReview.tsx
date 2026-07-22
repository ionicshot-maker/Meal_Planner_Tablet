import { useState, useEffect } from 'react'
import { applyIngredientBatch, type IngredientBatchOp } from '@/db/ingredients'
import { saveHouseholdItem } from '@/db/householdItems'
import { saveProcessedReceipt } from '@/db/processedReceipts'
import { useSettings } from '@/context/SettingsContext'
import { normalizeBrandName } from '@/utils/brandNormalization'
import { normalizeUnit } from '@/utils/recipeCalculations'
import { newId, now } from '@/utils/ids'
import { resolveCandidateSelection, candidateLabel } from '@/utils/receiptMatching'
import type { LineMatchResult, RankedCandidate, ConfidenceTier } from '@/utils/receiptMatching'
import { lookupBarcodeProduct } from '@/utils/barcodeLookup'
import { lookupBarcodeWeb, type WebLookupProduct } from '@/utils/webBarcodeLookup'
import { scanNutritionLabel, uncertainLabelFields } from '@/utils/labelScanLookup'
import { PhotoCaptureCrop } from '@/components/PhotoCaptureCrop'
import { IngredientPicker, type PickedIngredient } from '@/pages/Cookbook/IngredientPicker'
import type { NormalizedLine } from '@/utils/receiptPriceNormalization'
import type { Ingredient, IngredientUnit, IngredientVariant, HouseholdItem, Macros } from '@/types'
import styles from './ReceiptLineReview.module.css'

type Mode = 'match' | 'pending' | 'createNew'
type PriceDecision = 'not-needed' | 'pending' | 'update' | 'sale-skip'
type ItemType = 'ingredient' | 'household' | 'skip'
type BarcodeLookupStatus = 'idle' | 'loading' | 'found' | 'not-found' | 'non-food' | 'error'
type WebLookupStatus = 'idle' | 'loading' | 'found' | 'not-found' | 'error'
type LabelPhotoStatus = 'idle' | 'loading' | 'found' | 'low-confidence' | 'error'

const BLANK_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 }

export interface ReceiptLineDraft {
  id: string
  normalized: NormalizedLine
  match: LineMatchResult
  itemType: ItemType
  mode: Mode
  selectedIngredientId?: string
  selectedVariantId?: string
  // Set whenever a candidate is selected (from the matcher's own list or via
  // manual search) — the display label doesn't need to re-derive from
  // line.match.candidates, which won't contain a manually-searched pick.
  selectedLabel?: string
  editableName: string
  editableUnitPrice: number
  editableServings: string
  newCategory: string
  newBrand: string
  priceDecision: PriceDecision
  // Create-new-ingredient nutrition — prefilled from a barcode lookup when
  // one succeeds, otherwise left blank/zeroed and flagged for manual entry.
  macros: Macros
  servingSize: number
  servingUnit: IngredientUnit
  barcodeLookupStatus: BarcodeLookupStatus
  barcodeLookupAttempted: boolean
  // Primary fallback when Open Food Facts comes back not-found — photograph
  // the actual product's label via the same OCR pipeline the Scan Label tab
  // uses. Unlike the web-search fallback below, a result here auto-fills
  // directly (no separate "apply" step): there's no product-identity
  // ambiguity to resolve since it's a photo of the item in hand, only
  // transcription risk, which uncertainFields flags per-field.
  labelCaptureOpen: boolean
  labelPhotoStatus: LabelPhotoStatus
  labelUncertainFields?: Set<string>
  labelStatusMessage?: string
  // Secondary fallback, only ever triggered by an explicit "Search the web
  // instead" click — never auto-fires. A suggestion here is never
  // auto-applied; webSuggestionDismissed tracks an explicit "no thanks" so
  // the card can be hidden without losing what was found.
  webLookupStatus: WebLookupStatus
  webLookupAttempted: boolean
  webLookupResult?: WebLookupProduct
  webSuggestionApplied: boolean
  webSuggestionDismissed: boolean
  saved: boolean
  error: string
}

interface Props {
  lines: ReceiptLineDraft[]
  setLines: React.Dispatch<React.SetStateAction<ReceiptLineDraft[]>>
  storeName: string | null
  receiptDate: string | null
  receiptTotal: number | null
  photoDataUrl: string | null
  defaultCategory: string
  onItemSaved: (name: string) => void
  onStartOver: () => void
}

const TIER_LABEL: Record<ConfidenceTier, string> = {
  high: 'High confidence',
  medium: 'Pick a match',
  none: 'No match found',
}

const WEB_CONFIDENCE_LABEL: Record<WebLookupProduct['confidence'], string> = {
  high: 'High confidence — barcode confirmed',
  medium: 'Medium confidence — barcode unconfirmed',
  low: 'Low confidence — name/brand match only',
}

const LABEL_CAPTURE_TIPS = [
  'Crop tightly to just the nutrition facts panel for best results',
  'Make sure the label is flat and not curved or wrinkled',
  'Good lighting with no glare on the label surface',
  'Hold the camera straight on, not at an angle',
]

// Sale detection: under 10% difference is a simple "update?"; 10%+ gets
// flagged explicitly as a possible sale so a temporary discount doesn't get
// baked in as the new baseline price.
function priceDeltaInfo(oldPrice: number, newPrice: number): { pct: number; isSaleRange: boolean } {
  const pct = oldPrice > 0 ? Math.abs(newPrice - oldPrice) / oldPrice : 0
  return { pct, isSaleRange: pct >= 0.10 }
}

const MACRO_FIELDS: { key: keyof Macros; label: string }[] = [
  { key: 'calories', label: 'Cal' },
  { key: 'protein', label: 'Pro (g)' },
  { key: 'carbs', label: 'Carb (g)' },
  { key: 'fiber', label: 'Fiber (g)' },
  { key: 'sugar', label: 'Sugar (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'sodium', label: 'Sodium (mg)' },
]

export function ReceiptLineReview({
  lines, setLines, storeName, receiptDate, receiptTotal, photoDataUrl, defaultCategory, onItemSaved, onStartOver,
}: Props) {
  const { settings } = useSettings()
  const [saving, setSaving] = useState(false)
  const [batchError, setBatchError] = useState('')

  function updateLine(id: string, patch: Partial<ReceiptLineDraft>) {
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  // Switching a line to Household Item should land on a sensible category for
  // that context rather than carrying over whatever the ingredient-path guess
  // picked (e.g. "Meat & Poultry") — falls back to the household default, or
  // the first available category if that isn't configured.
  function switchToHousehold(id: string) {
    const householdDefault = categories.find(c => c === 'Household Items') ?? categories[0] ?? ''
    updateLine(id, { itemType: 'household', newCategory: householdDefault })
  }

  // Auto-attempts a barcode lookup for any line that's sitting in "create a
  // new ingredient" with a legible, checksum-valid barcode — the same
  // Open Food Facts source/logic the Barcode Lookup tab uses — so nutrition
  // doesn't default to a wall of zeros when the receipt line actually has a
  // scannable product behind it. Runs once per line (tracked via
  // barcodeLookupAttempted) and re-checks on every lines change, so it also
  // catches a line switched into create-new manually after initial load.
  useEffect(() => {
    const toLookup = lines.filter(l =>
      l.itemType === 'ingredient' &&
      l.mode === 'createNew' &&
      l.match.validBarcode &&
      !l.barcodeLookupAttempted
    )
    if (toLookup.length === 0) return

    setLines(ls => ls.map(l => (
      toLookup.some(t => t.id === l.id) ? { ...l, barcodeLookupAttempted: true, barcodeLookupStatus: 'loading' } : l
    )))

    for (const line of toLookup) {
      lookupBarcodeProduct(line.match.validBarcode!).then(result => {
        if (result.status === 'found' && result.product) {
          updateLine(line.id, {
            barcodeLookupStatus: 'found',
            macros: result.product.macros,
            servingSize: result.product.serving_display_size || 1,
            servingUnit: (result.product.serving_display_unit || 'each') as IngredientUnit,
            newBrand: line.newBrand || result.product.brands.split(',')[0].trim(),
          })
        } else if (result.status === 'non-food') {
          updateLine(line.id, { barcodeLookupStatus: 'non-food' })
        } else {
          updateLine(line.id, { barcodeLookupStatus: result.status === 'error' ? 'error' : 'not-found' })
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines])

  // Secondary fallback — only ever runs when explicitly requested via
  // "Search the web instead" (never auto-fires). Guarded by
  // webLookupAttempted so a second click can't double-fire it.
  function triggerWebLookup(line: ReceiptLineDraft) {
    if (!settings.geminiApiKey || line.webLookupAttempted) return
    updateLine(line.id, { webLookupAttempted: true, webLookupStatus: 'loading' })
    lookupBarcodeWeb(
      line.match.validBarcode!,
      line.editableName,
      line.newBrand,
      settings.geminiApiKey,
      settings.geminiModel || 'gemini-3.1-flash-lite'
    ).then(result => {
      if (result.status === 'found' && result.product) {
        updateLine(line.id, { webLookupStatus: 'found', webLookupResult: result.product })
      } else {
        updateLine(line.id, { webLookupStatus: result.status === 'error' ? 'error' : 'not-found' })
      }
    })
  }

  // Primary fallback — the user photographs the actual product's nutrition
  // label and it goes through the same OCR pipeline the Scan Label tab uses.
  // No product-identity ambiguity to gate on here (it's a photo of the item
  // in hand), so unlike the web-search path this auto-fills directly; the
  // per-field uncertainFields set still gets flagged for review since OCR
  // transcription can still misread a number even off a real photo.
  async function handleLabelPhoto(line: ReceiptLineDraft, dataUrl: string) {
    updateLine(line.id, { labelCaptureOpen: false, labelPhotoStatus: 'loading' })
    const result = await scanNutritionLabel(dataUrl, settings.geminiApiKey, settings.geminiModel || 'gemini-3.1-flash-lite')

    if (result.status === 'found' && result.nutrition) {
      const n = result.nutrition
      updateLine(line.id, {
        labelPhotoStatus: 'found',
        labelUncertainFields: uncertainLabelFields(n),
        macros: {
          calories: n.calories ?? 0,
          protein: n.protein ?? 0,
          carbs: n.carbs ?? 0,
          fiber: n.fiber ?? 0,
          sugar: n.sugar ?? 0,
          fat: n.fat ?? 0,
          sodium: n.sodium ?? 0,
          saturatedFat: n.saturatedFat ?? undefined,
          transFat: n.transFat ?? undefined,
        },
        servingSize: n.servingSize ?? line.servingSize,
        servingUnit: n.servingUnit ? normalizeUnit(n.servingUnit) : line.servingUnit,
        newBrand: line.newBrand || (n.brand?.trim() || ''),
      })
    } else if (result.status === 'low-confidence') {
      updateLine(line.id, { labelPhotoStatus: 'low-confidence', labelStatusMessage: result.reason })
    } else {
      updateLine(line.id, { labelPhotoStatus: 'error', labelStatusMessage: result.errorMessage })
    }
  }

  // Copies a web-search suggestion's fields into the line's own editable
  // state — still fully editable afterward, never a silent/final write.
  // Only overrides macro fields Gemini actually reported (partial merge),
  // and only fills brand/serving if the user hasn't already typed something.
  function applyWebSuggestion(line: ReceiptLineDraft) {
    const product = line.webLookupResult
    if (!product) return
    updateLine(line.id, {
      macros: { ...line.macros, ...product.macros },
      servingSize: product.servingDisplaySize ?? line.servingSize,
      servingUnit: (product.servingDisplayUnit as IngredientUnit) ?? line.servingUnit,
      newBrand: line.newBrand || product.brand,
      webSuggestionApplied: true,
    })
  }

  function selectCandidate(line: ReceiptLineDraft, candidate: RankedCandidate) {
    const selection = resolveCandidateSelection(line.normalized, candidate, line.editableServings, line.editableUnitPrice)
    updateLine(line.id, {
      mode: 'match',
      selectedIngredientId: selection.selectedIngredientId,
      selectedVariantId: selection.selectedVariantId,
      selectedLabel: candidateLabel(candidate),
      editableServings: selection.servings,
      priceDecision: selection.priceDecision,
    })
  }

  function selectCreateNew(line: ReceiptLineDraft) {
    updateLine(line.id, { mode: 'createNew', selectedIngredientId: undefined, selectedVariantId: undefined, priceDecision: 'not-needed' })
  }

  // Fallback for when the reused matcher (findSmartMatches/findBarcodeMatch)
  // finds nothing — the algorithm can miss real matches that need human
  // judgment (e.g. "Ground Round 85%" only a person would connect to
  // "Ground Beef, 85/15" by fat ratio), so "no automatic candidates" must
  // never mean "your only option is Create New." Reuses the same picker
  // RecipeEditor.tsx uses to link a recipe line to an existing ingredient.
  function handleManualPick(line: ReceiptLineDraft, picked: PickedIngredient) {
    const candidate: RankedCandidate = { ingredient: picked.ingredient, variant: picked.variant, source: 'name' }
    selectCandidate(line, candidate)
  }

  function currentVariant(line: ReceiptLineDraft): IngredientVariant | undefined {
    return line.match.candidates.find(c => c.ingredient.id === line.selectedIngredientId)?.variant
  }

  function validateLine(line: ReceiptLineDraft): string {
    if (line.itemType === 'skip') return ''
    if (line.itemType === 'household') {
      return line.editableName.trim() ? '' : 'Name is required'
    }
    // itemType === 'ingredient'
    const servings = Number(line.editableServings)
    if (!line.editableServings.trim() || !(servings > 0)) return 'Servings per package is required'
    if (!(line.editableUnitPrice > 0)) return 'Unit price must be greater than 0'
    if (line.mode === 'createNew' && !line.editableName.trim()) return 'Name is required'
    if (line.mode === 'pending') return 'Pick a match or choose Create New'
    if (line.priceDecision === 'pending') return 'Confirm whether to update the price or treat it as a sale'
    return ''
  }

  async function handleSaveAll() {
    const validated = lines.map(l => ({ ...l, error: validateLine(l) }))
    if (validated.some(l => !l.saved && l.error)) {
      setLines(validated)
      return
    }

    setSaving(true)
    setBatchError('')

    const ops: IngredientBatchOp[] = []
    const householdSaves: { line: ReceiptLineDraft; item: HouseholdItem }[] = []
    const pendingRowIds: string[] = []

    for (const line of validated) {
      if (line.saved) continue
      pendingRowIds.push(line.id)

      if (line.itemType === 'skip') continue

      const servings = Number(line.editableServings)
      const packageCost = line.editableUnitPrice
      const barcode = line.match.validBarcode ?? line.normalized.barcodeText ?? undefined

      if (line.itemType === 'household') {
        householdSaves.push({
          line,
          item: {
            id: newId(),
            name: line.editableName.trim(),
            category: line.newCategory || 'Household Items',
            brand: line.newBrand.trim() || undefined,
            price: packageCost > 0 ? packageCost : undefined,
            createdAt: now(),
          },
        })
        continue
      }

      // itemType === 'ingredient'
      if (line.mode === 'match' && line.selectedIngredientId) {
        if (line.selectedVariantId && line.priceDecision !== 'sale-skip') {
          ops.push({ type: 'updatePrice', ingredientId: line.selectedIngredientId, variantId: line.selectedVariantId, packageCost, totalServingsInPackage: servings })
        } else if (!line.selectedVariantId) {
          const variantId = newId()
          ops.push({
            type: 'addVariant',
            ingredientId: line.selectedIngredientId,
            variant: {
              id: variantId,
              parentId: line.selectedIngredientId,
              brand: normalizeBrandName(line.newBrand) || 'Generic',
              defaultUnit: 'each' as IngredientUnit,
              servingSize: 1,
              servingUnit: 'each' as IngredientUnit,
              macros: BLANK_MACROS,
              packageCost,
              totalServingsInPackage: servings,
              costPerServing: servings > 0 ? packageCost / servings : undefined,
              priceLastUpdated: now(),
              barcode,
            },
          })
        }
        // sale-skip on a pinned variant: intentionally no price op, but the row
        // still counts as "handled" so it can be marked saved below.
      } else {
        const ingredientId = newId()
        const variantId = newId()
        const newIngredient: Ingredient = {
          id: ingredientId,
          name: line.editableName.trim(),
          category: line.newCategory || defaultCategory,
          perishable: false,
          frozen: false,
          alwaysOnHand: false,
          archived: false,
          createdAt: now(),
          updatedAt: now(),
          defaultVariantId: variantId,
          variants: [{
            id: variantId,
            parentId: ingredientId,
            brand: normalizeBrandName(line.newBrand) || 'Generic',
            defaultUnit: line.servingUnit,
            servingSize: line.servingSize,
            servingUnit: line.servingUnit,
            macros: line.macros,
            packageCost,
            totalServingsInPackage: servings,
            costPerServing: servings > 0 ? packageCost / servings : undefined,
            priceLastUpdated: now(),
            barcode,
          }],
        }
        ops.push({ type: 'createIngredient', ingredient: newIngredient })
      }
    }

    try {
      // Every ingredient write for this batch happens in one transaction —
      // either all of it lands or none of it does, so an error partway
      // through can't leave some rows saved and others not. Household items
      // are a separate, simpler store with no cross-references to repoint,
      // so they're saved individually rather than folded into that batch.
      await applyIngredientBatch(ops)
      for (const { item } of householdSaves) {
        await saveHouseholdItem(item)
      }

      await saveProcessedReceipt({
        id: newId(),
        store: storeName,
        date: receiptDate,
        total: receiptTotal,
        photoDataUrl: photoDataUrl ?? undefined,
        processedAt: now(),
      })

      setLines(ls => ls.map(l => (pendingRowIds.includes(l.id) ? { ...l, saved: true, error: '' } : l)))
      for (const line of validated) {
        if (!pendingRowIds.includes(line.id)) continue
        if (line.itemType === 'skip') continue
        const label = line.itemType === 'household'
          ? line.editableName.trim()
          : (line.mode === 'createNew' ? line.editableName.trim() : (line.selectedLabel ?? line.editableName))
        onItemSaved(label)
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Could not save this batch — nothing was written.')
    }

    setSaving(false)
  }

  const unsavedCount = lines.filter(l => !l.saved).length
  const categories = settings.ingredientCategories

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <span className={styles.desc}>
          {storeName ? `${storeName} — ` : ''}{lines.length} line{lines.length !== 1 ? 's' : ''} found · {unsavedCount} unsaved
        </span>
        <button className={styles.startOverBtn} onClick={onStartOver}>Scan a different receipt</button>
      </div>

      {batchError && (
        <div className={styles.batchError}>
          <strong>Nothing was saved.</strong> {batchError}
        </div>
      )}

      <div className={styles.rows}>
        {lines.map(line => {
          const variant = currentVariant(line)
          const showPriceDecision = line.itemType === 'ingredient' && line.priceDecision !== 'not-needed' && variant?.packageCost != null
          const delta = showPriceDecision ? priceDeltaInfo(variant!.packageCost!, line.editableUnitPrice) : null
          const showWebSuggestion = line.webLookupStatus === 'found' && !!line.webLookupResult && !line.webSuggestionDismissed
          // The choice row (take a photo / search the web) stays available
          // until one path actually lands something usable — label photo
          // succeeding, or a web suggestion getting applied — rather than
          // disappearing the moment either is merely attempted.
          const showChoiceRow = line.barcodeLookupStatus === 'not-found' &&
            line.labelPhotoStatus !== 'found' && line.labelPhotoStatus !== 'loading' && !line.labelCaptureOpen

          return (
            <div key={line.id} className={`${styles.row} ${line.saved ? styles.rowSaved : ''} ${line.error ? styles.rowError : ''}`}>
              <div className={styles.rowHeader}>
                <div className={styles.rawText}>
                  <span className={styles.rawLabel}>Receipt text:</span> "{line.normalized.rawText}"
                  {line.normalized.crossCheckWarning && (
                    <span className={styles.crossCheckWarning}> ⚠ {line.normalized.crossCheckWarning}</span>
                  )}
                </div>
                {line.itemType === 'ingredient' && (
                  <span className={`${styles.tierBadge} ${styles[`tier_${line.match.barcodeMatch ? 'high' : line.match.tier}`]}`}>
                    {line.match.barcodeMatch ? 'Barcode match' : TIER_LABEL[line.match.tier]}
                  </span>
                )}
              </div>

              {/* Three-way choice — always visible, never pre-selected toward
                  "Don't Add" (that's only ever picked by clicking it). */}
              <div className={styles.itemTypeRow} role="radiogroup" aria-label="Add as">
                <button
                  type="button"
                  className={`${styles.itemTypeBtn} ${line.itemType === 'ingredient' ? styles.itemTypeBtnActive : ''}`}
                  disabled={line.saved}
                  onClick={() => updateLine(line.id, { itemType: 'ingredient' })}
                >
                  Add as Ingredient
                </button>
                <button
                  type="button"
                  className={`${styles.itemTypeBtn} ${line.itemType === 'household' ? styles.itemTypeBtnActive : ''}`}
                  disabled={line.saved}
                  onClick={() => switchToHousehold(line.id)}
                >
                  Add as Household Item
                </button>
                <button
                  type="button"
                  className={`${styles.itemTypeBtn} ${styles.itemTypeBtnSkip} ${line.itemType === 'skip' ? styles.itemTypeBtnActive : ''}`}
                  disabled={line.saved}
                  onClick={() => updateLine(line.id, { itemType: 'skip' })}
                >
                  Don't Add
                </button>
              </div>

              {line.itemType === 'skip' ? (
                <p className={styles.skipNote}>This line won't be added to anything.</p>
              ) : line.itemType === 'household' ? (
                <div className={styles.rowBody}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      className={styles.input}
                      value={line.editableName}
                      disabled={line.saved}
                      onChange={e => updateLine(line.id, { editableName: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Category</span>
                    <select
                      className={styles.select}
                      value={categories.includes(line.newCategory) ? line.newCategory : (categories.find(c => c === 'Household Items') ?? categories[0] ?? '')}
                      disabled={line.saved}
                      onChange={e => updateLine(line.id, { newCategory: e.target.value })}
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Brand</span>
                    <input
                      className={styles.input}
                      value={line.newBrand}
                      disabled={line.saved}
                      placeholder="optional"
                      onChange={e => updateLine(line.id, { newBrand: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Price ($)</span>
                    <input
                      className={styles.inputNum}
                      type="text"
                      inputMode="decimal"
                      value={line.editableUnitPrice}
                      disabled={line.saved}
                      onChange={e => updateLine(line.id, { editableUnitPrice: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className={styles.rowBody}>
                    <label className={styles.field}>
                      <span>Name</span>
                      <input
                        className={styles.input}
                        value={line.editableName}
                        disabled={line.saved}
                        onChange={e => updateLine(line.id, { editableName: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Unit price ($)</span>
                      <input
                        className={styles.inputNum}
                        type="text"
                        inputMode="decimal"
                        value={line.editableUnitPrice}
                        disabled={line.saved}
                        onChange={e => updateLine(line.id, { editableUnitPrice: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Servings per package *</span>
                      <input
                        className={styles.inputNum}
                        type="text"
                        inputMode="decimal"
                        placeholder="required"
                        value={line.editableServings}
                        disabled={line.saved}
                        onChange={e => updateLine(line.id, { editableServings: e.target.value })}
                      />
                    </label>
                  </div>

                  {showPriceDecision && delta && (
                    <div className={`${styles.priceDecisionBox} ${delta.isSaleRange ? styles.saleWarning : ''}`}>
                      {delta.isSaleRange ? (
                        <p>⚠ Last price was <strong>${variant!.packageCost!.toFixed(2)}</strong>, this receipt shows{' '}
                          <strong>${line.editableUnitPrice.toFixed(2)}</strong> ({Math.round(delta.pct * 100)}% difference) —
                          this could be a sale.</p>
                      ) : (
                        <p>Last price was <strong>${variant!.packageCost!.toFixed(2)}</strong>, this shows{' '}
                          <strong>${line.editableUnitPrice.toFixed(2)}</strong>. Update?</p>
                      )}
                      <div className={styles.priceDecisionActions}>
                        <button
                          className={styles.priceDecisionBtn}
                          disabled={line.saved}
                          onClick={() => updateLine(line.id, { priceDecision: 'update' })}
                        >
                          {delta.isSaleRange ? 'Update baseline price' : 'Update price'}
                        </button>
                        <button
                          className={styles.priceDecisionBtn}
                          disabled={line.saved}
                          onClick={() => updateLine(line.id, { priceDecision: 'sale-skip' })}
                        >
                          {delta.isSaleRange ? 'This was a sale — don\'t update' : 'Keep old price'}
                        </button>
                      </div>
                      {(line.priceDecision === 'update' || line.priceDecision === 'sale-skip') && (
                        <p className={styles.priceDecisionChosen}>
                          ✓ {line.priceDecision === 'update' ? 'Will update price' : 'Will keep the existing price'}
                        </p>
                      )}
                    </div>
                  )}

                  {line.mode === 'match' && line.selectedIngredientId && (
                    <div className={styles.matchSummary}>
                      Matched to: <strong>{line.selectedLabel}</strong>
                      {!line.selectedVariantId && (
                        <label className={styles.field} style={{ marginTop: 4 }}>
                          <span>New variant brand</span>
                          <input
                            className={styles.input}
                            value={line.newBrand}
                            disabled={line.saved}
                            placeholder="e.g. Great Value"
                            onChange={e => updateLine(line.id, { newBrand: e.target.value })}
                          />
                        </label>
                      )}
                      {!line.saved && (
                        <button className={styles.linkBtn} onClick={() => updateLine(line.id, { mode: 'pending' })}>
                          Change match
                        </button>
                      )}
                    </div>
                  )}

                  {line.mode !== 'match' && line.match.candidates.length > 0 && (
                    <div className={styles.candidateList}>
                      {line.match.tier === 'none' && <p className={styles.candidateHint}>Did you mean one of these?</p>}
                      {line.match.candidates.map(c => (
                        <button
                          key={`${c.ingredient.id}-${c.variant?.id ?? ''}`}
                          className={styles.candidateBtn}
                          disabled={line.saved}
                          onClick={() => selectCandidate(line, c)}
                        >
                          {candidateLabel(c)} <span className={styles.candidateSource}>{c.source === 'barcode' ? 'barcode' : 'name match'}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {line.mode === 'createNew' ? (
                    <div className={styles.createNewBox}>
                      {!line.saved && (
                        <div className={styles.manualSearchWrap}>
                          <span className={styles.createNewLabel}>Not it? Search your existing ingredients</span>
                          <IngredientPicker
                            onPick={picked => handleManualPick(line, picked)}
                            placeholder="Search ingredients…"
                          />
                        </div>
                      )}
                      <span className={styles.createNewLabel}>Or create a new ingredient</span>

                      {line.barcodeLookupStatus === 'loading' && (
                        <p className={styles.barcodeStatus}>🔍 Looking up nutrition from barcode…</p>
                      )}
                      {line.barcodeLookupStatus === 'found' && (
                        <p className={styles.barcodeStatusOk}>✓ Nutrition filled in from barcode lookup — please verify.</p>
                      )}
                      {line.labelCaptureOpen && (
                        <div className={styles.labelCaptureBox}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => updateLine(line.id, { labelCaptureOpen: false })}
                          >
                            ← Cancel
                          </button>
                          <PhotoCaptureCrop
                            primaryLabel="Take Photo or Scan Label"
                            tipsTitle="📸 Tips for scanning nutrition labels:"
                            tips={LABEL_CAPTURE_TIPS}
                            onComplete={dataUrl => handleLabelPhoto(line, dataUrl)}
                          />
                        </div>
                      )}
                      {line.barcodeLookupStatus === 'not-found' && line.labelPhotoStatus === 'loading' && (
                        <p className={styles.barcodeStatus}>🔍 Reading your label photo…</p>
                      )}
                      {line.labelPhotoStatus === 'found' && (
                        <div>
                          <p className={styles.barcodeStatusOk}>📸 Filled in from your label photo — please verify.</p>
                          {line.labelUncertainFields && line.labelUncertainFields.size > 0 && (
                            <p className={styles.barcodeStatus}>Some fields couldn't be read confidently — highlighted below.</p>
                          )}
                          <button
                            type="button"
                            className={styles.linkBtn}
                            disabled={line.saved}
                            onClick={() => updateLine(line.id, { labelCaptureOpen: true, labelPhotoStatus: 'idle', labelUncertainFields: undefined })}
                          >
                            Retake photo
                          </button>
                        </div>
                      )}
                      {showChoiceRow && (
                        <div className={styles.fallbackChoiceBox}>
                          {line.labelPhotoStatus === 'low-confidence' && (
                            <p className={styles.barcodeStatus}>
                              ⚠️ Couldn't read that label clearly{line.labelStatusMessage ? ` — ${line.labelStatusMessage}` : ''}.
                            </p>
                          )}
                          {line.labelPhotoStatus === 'error' && (
                            <p className={styles.barcodeStatus}>
                              ⚠️ Label scan failed{line.labelStatusMessage ? ` — ${line.labelStatusMessage}` : ''}.
                            </p>
                          )}
                          <p className={styles.barcodeNotFoundBanner}>Barcode lookup found no product — nutrition left blank.</p>
                          <div className={styles.fallbackChoiceActions}>
                            <button
                              type="button"
                              className={styles.priceDecisionBtn}
                              disabled={line.saved}
                              onClick={() => updateLine(line.id, { labelCaptureOpen: true })}
                            >
                              📸 Take a photo of the label
                            </button>
                            {!line.webLookupAttempted && (
                              <button
                                type="button"
                                className={styles.linkBtn}
                                disabled={line.saved}
                                onClick={() => triggerWebLookup(line)}
                              >
                                Search the web instead
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {line.webLookupStatus === 'loading' && (
                        <p className={styles.barcodeStatus}>🔍 Searching the web for this product…</p>
                      )}
                      {showWebSuggestion && line.webLookupResult && (
                        <div className={styles.webSuggestionCard}>
                          <div className={styles.webSuggestionHeader}>
                            <span className={`${styles.tierBadge} ${styles[`tier_${line.webLookupResult.confidence}`]}`}>
                              {WEB_CONFIDENCE_LABEL[line.webLookupResult.confidence]}
                            </span>
                            <span className={styles.webSuggestionName}>
                              {line.webLookupResult.productName}
                              {line.webLookupResult.brand ? ` — ${line.webLookupResult.brand}` : ''}
                            </span>
                          </div>
                          <a
                            href={line.webLookupResult.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.webSuggestionSource}
                          >
                            Source: {line.webLookupResult.sourceTitle}
                          </a>
                          <p className={styles.webVerifyNotice}>
                            ⚠️ Please verify against the source before saving — a matched barcode confirms product identity, not that these numbers were read correctly.
                          </p>
                          {line.webSuggestionApplied ? (
                            <p className={styles.barcodeStatusOk}>✓ Applied — please double-check the values below against the source.</p>
                          ) : (
                            <div className={styles.webSuggestionActions}>
                              <button
                                type="button"
                                className={styles.priceDecisionBtn}
                                disabled={line.saved}
                                onClick={() => applyWebSuggestion(line)}
                              >
                                Use this data
                              </button>
                              <button
                                type="button"
                                className={styles.linkBtn}
                                disabled={line.saved}
                                onClick={() => updateLine(line.id, { webSuggestionDismissed: true })}
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {(line.webLookupStatus === 'not-found' || line.webLookupStatus === 'error') && !showWebSuggestion && (
                        <p className={styles.barcodeStatus}>Web search didn't find a confident match either — nutrition left blank, fill in manually if you'd like.</p>
                      )}
                      {line.barcodeLookupStatus === 'error' && (
                        <p className={styles.barcodeStatus}>Barcode lookup failed — nutrition left blank, fill in manually if you'd like.</p>
                      )}
                      {line.barcodeLookupStatus === 'non-food' && (
                        <div className={styles.nonFoodBanner}>
                          <span>This barcode looks like a non-food product — nutrition wasn't filled in.</span>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            disabled={line.saved}
                            onClick={() => switchToHousehold(line.id)}
                          >
                            Switch to Household Item
                          </button>
                        </div>
                      )}

                      <label className={styles.field}>
                        <span>Category</span>
                        <select
                          className={styles.select}
                          value={line.newCategory}
                          disabled={line.saved}
                          onChange={e => updateLine(line.id, { newCategory: e.target.value })}
                        >
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Brand</span>
                        <input
                          className={styles.input}
                          value={line.newBrand}
                          disabled={line.saved}
                          placeholder="Generic"
                          onChange={e => updateLine(line.id, { newBrand: e.target.value })}
                        />
                      </label>

                      <div className={styles.macroGrid}>
                        {MACRO_FIELDS.map(f => (
                          <label key={f.key} className={styles.macroField}>
                            <span>{f.label}</span>
                            <input
                              className={`${styles.inputNum} ${line.labelUncertainFields?.has(f.key) ? styles.fieldWarning : ''}`}
                              type="text"
                              inputMode="decimal"
                              value={line.macros[f.key] ?? 0}
                              disabled={line.saved}
                              onChange={e => updateLine(line.id, { macros: { ...line.macros, [f.key]: Number(e.target.value) || 0 } })}
                            />
                          </label>
                        ))}
                      </div>

                      {!line.saved && line.match.candidates.length > 0 && (
                        <button className={styles.linkBtn} onClick={() => updateLine(line.id, { mode: 'pending' })}>
                          Back to matching
                        </button>
                      )}
                    </div>
                  ) : (
                    !line.saved && (
                      <button className={styles.createNewToggle} onClick={() => selectCreateNew(line)}>
                        + Create New Ingredient Instead
                      </button>
                    )
                  )}
                </>
              )}

              {line.error && <p className={styles.rowErrorMsg}>{line.error}</p>}
              {line.saved && <p className={styles.rowSavedMsg}>✓ Saved</p>}
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <button className={styles.saveAllBtn} onClick={handleSaveAll} disabled={saving || unsavedCount === 0}>
          {saving ? 'Saving…' : `Save All (${unsavedCount})`}
        </button>
      </div>
    </div>
  )
}
