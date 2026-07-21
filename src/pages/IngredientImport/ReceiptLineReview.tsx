import { useState } from 'react'
import { applyIngredientBatch, type IngredientBatchOp } from '@/db/ingredients'
import { saveProcessedReceipt } from '@/db/processedReceipts'
import { useSettings } from '@/context/SettingsContext'
import { normalizeBrandName } from '@/utils/brandNormalization'
import { newId, now } from '@/utils/ids'
import { resolveCandidateSelection, candidateLabel } from '@/utils/receiptMatching'
import type { LineMatchResult, RankedCandidate, ConfidenceTier } from '@/utils/receiptMatching'
import { IngredientPicker, type PickedIngredient } from '@/pages/Cookbook/IngredientPicker'
import type { NormalizedLine } from '@/utils/receiptPriceNormalization'
import type { Ingredient, IngredientUnit, IngredientVariant } from '@/types'
import styles from './ReceiptLineReview.module.css'

type Mode = 'match' | 'pending' | 'createNew'
type PriceDecision = 'not-needed' | 'pending' | 'update' | 'sale-skip'

export interface ReceiptLineDraft {
  id: string
  normalized: NormalizedLine
  match: LineMatchResult
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

// Sale detection: under 10% difference is a simple "update?"; 10%+ gets
// flagged explicitly as a possible sale so a temporary discount doesn't get
// baked in as the new baseline price.
function priceDeltaInfo(oldPrice: number, newPrice: number): { pct: number; isSaleRange: boolean } {
  const pct = oldPrice > 0 ? Math.abs(newPrice - oldPrice) / oldPrice : 0
  return { pct, isSaleRange: pct >= 0.10 }
}

export function ReceiptLineReview({
  lines, setLines, storeName, receiptDate, receiptTotal, photoDataUrl, defaultCategory, onItemSaved, onStartOver,
}: Props) {
  const { settings } = useSettings()
  const [saving, setSaving] = useState(false)
  const [batchError, setBatchError] = useState('')

  function updateLine(id: string, patch: Partial<ReceiptLineDraft>) {
    setLines(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))
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
    const pendingRowIds: string[] = []

    for (const line of validated) {
      if (line.saved) continue
      const servings = Number(line.editableServings)
      const packageCost = line.editableUnitPrice
      pendingRowIds.push(line.id)

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
              macros: { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 },
              packageCost,
              totalServingsInPackage: servings,
              costPerServing: servings > 0 ? packageCost / servings : undefined,
              priceLastUpdated: now(),
              barcode: line.normalized.barcodeText ?? undefined,
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
            defaultUnit: 'each' as IngredientUnit,
            servingSize: 1,
            servingUnit: 'each' as IngredientUnit,
            macros: { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 },
            packageCost,
            totalServingsInPackage: servings,
            costPerServing: servings > 0 ? packageCost / servings : undefined,
            priceLastUpdated: now(),
            barcode: line.normalized.barcodeText ?? undefined,
          }],
        }
        ops.push({ type: 'createIngredient', ingredient: newIngredient })
      }
    }

    try {
      // Every write for this batch happens in one transaction — either all of
      // it lands or none of it does, so an error partway through can't leave
      // some rows saved and others not.
      await applyIngredientBatch(ops)

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
        if (pendingRowIds.includes(line.id)) onItemSaved(line.mode === 'createNew' ? line.editableName.trim() : (line.selectedLabel ?? line.editableName))
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
          const showPriceDecision = line.priceDecision !== 'not-needed' && variant?.packageCost != null
          const delta = showPriceDecision ? priceDeltaInfo(variant!.packageCost!, line.editableUnitPrice) : null

          return (
            <div key={line.id} className={`${styles.row} ${line.saved ? styles.rowSaved : ''} ${line.error ? styles.rowError : ''}`}>
              <div className={styles.rowHeader}>
                <div className={styles.rawText}>
                  <span className={styles.rawLabel}>Receipt text:</span> "{line.normalized.rawText}"
                  {line.normalized.crossCheckWarning && (
                    <span className={styles.crossCheckWarning}> ⚠ {line.normalized.crossCheckWarning}</span>
                  )}
                </div>
                <span className={`${styles.tierBadge} ${styles[`tier_${line.match.barcodeMatch ? 'high' : line.match.tier}`]}`}>
                  {line.match.barcodeMatch ? 'Barcode match' : TIER_LABEL[line.match.tier]}
                </span>
              </div>

              {line.match.barcodeTextDisagreement && (
                <p className={styles.warningBanner}>
                  ⚠ The barcode matched <strong>{line.match.barcodeMatch?.ingredient.name}</strong>, but the receipt
                  text ("{line.normalized.parsedName}") looks different — the barcode is being trusted, but double-check
                  this is right.
                </p>
              )}
              {line.match.barcodeMultiMatch && (
                <p className={styles.warningBanner}>
                  ⚠ This barcode matches more than one ingredient record — pick the correct one below.
                </p>
              )}

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
