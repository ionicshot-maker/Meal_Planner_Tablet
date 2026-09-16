import { useState, useEffect } from 'react'
import { Modal, Button } from '@/components/ui'
import { IngredientPicker, type PickedIngredient } from '@/pages/Cookbook/IngredientPicker'
import { mergeIngredients, countIngredientReferences, totalReferences, type IngredientReferenceCounts } from '@/db/mergeIngredients'
import type { Ingredient } from '@/types'
import styles from './MergeIngredientModal.module.css'

interface Props {
  ingredient: Ingredient
  onClose: () => void
  onMerged: () => void
}

interface FieldConflict {
  field: string
  kept: string
  discarded: string
}

// Pure, display-only comparison of the two candidates already in scope here
// (both full Ingredient objects — the `ingredient` prop and `target` state).
// No fetching, no backend call, no calculation beyond direct field equality.
// Scoped to exactly the fields the Slice 3 audit finding named as silently
// resolved (brand, barcode, price, macros) — mergeIngredients() doesn't
// merge these per field, it keeps the surviving ingredient's record whole
// and discards the rest, so this only discloses what's about to be lost; it
// doesn't offer a per-field choice. Compares each ingredient's variants[0],
// matching the existing option cards above, which already summarize each
// candidate the same way.
function getFieldConflicts(keep: Ingredient, away: Ingredient): FieldConflict[] {
  const kv = keep.variants[0]
  const av = away.variants[0]
  const conflicts: FieldConflict[] = []

  const kBrand = kv?.brand || 'Generic'
  const aBrand = av?.brand || 'Generic'
  if (kBrand !== aBrand) conflicts.push({ field: 'Brand', kept: kBrand, discarded: aBrand })

  const kBarcode = kv?.barcode || ''
  const aBarcode = av?.barcode || ''
  if (kBarcode !== aBarcode && (kBarcode || aBarcode)) {
    conflicts.push({ field: 'Barcode', kept: kBarcode || '(none)', discarded: aBarcode || '(none)' })
  }

  const kPrice = kv?.packageCost != null ? `$${kv.packageCost.toFixed(2)}${kv.store ? ` at ${kv.store}` : ''}` : null
  const aPrice = av?.packageCost != null ? `$${av.packageCost.toFixed(2)}${av.store ? ` at ${av.store}` : ''}` : null
  if (kPrice !== aPrice && (kPrice || aPrice)) {
    conflicts.push({ field: 'Price', kept: kPrice ?? '(none)', discarded: aPrice ?? '(none)' })
  }

  if (kv && av && JSON.stringify(kv.macros) !== JSON.stringify(av.macros)) {
    conflicts.push({ field: 'Nutrition values', kept: `${kv.macros.calories} cal/serving`, discarded: `${av.macros.calories} cal/serving` })
  }

  return conflicts
}

// General-purpose merge entry point from the Ingredients page — for
// duplicates that aren't barcode-related at all (manually-typed dupes,
// two separate imports of the same name, etc). Search for the other
// ingredient, choose which of the two survives (defaults to the one this
// modal was opened from), then confirm. Shares the same mergeIngredients()
// used by the Barcode Duplicate Finder in Dev Tools — one merge
// implementation, two entry points.
export function MergeIngredientModal({ ingredient, onClose, onMerged }: Props) {
  const [target, setTarget] = useState<Ingredient | null>(null)
  const [keepId, setKeepId] = useState(ingredient.id)
  const [categoryChoice, setCategoryChoice] = useState(ingredient.category)
  const [counts, setCounts] = useState<{ self: IngredientReferenceCounts; target: IngredientReferenceCounts } | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<IngredientReferenceCounts | null>(null)

  useEffect(() => {
    if (!target) { setCounts(null); return }
    let cancelled = false
    Promise.all([countIngredientReferences(ingredient.id), countIngredientReferences(target.id)]).then(([self, tgt]) => {
      if (!cancelled) setCounts({ self, target: tgt })
    })
    return () => { cancelled = true }
  }, [target, ingredient.id])

  // Category defaults to whichever ingredient is currently picked as "keep"
  // — re-defaults on a keep-flip so it doesn't silently carry over a choice
  // that no longer matches which record survives, but a manual pick (via
  // the dropdown below, when the two disagree) is respected until then.
  useEffect(() => {
    setCategoryChoice(keepId === ingredient.id ? ingredient.category : (target?.category ?? ingredient.category))
  }, [keepId, target, ingredient.category])

  function handlePick(picked: PickedIngredient) {
    if (picked.ingredient.id === ingredient.id) {
      setError("That's the same ingredient — pick a different one to merge with.")
      return
    }
    setError('')
    setTarget(picked.ingredient)
    setKeepId(ingredient.id)
  }

  async function handleConfirm() {
    if (!target) return
    const mergeAwayId = keepId === ingredient.id ? target.id : ingredient.id
    setMerging(true)
    setError('')
    try {
      const res = await mergeIngredients(keepId, mergeAwayId, { category: categoryChoice })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed — nothing was changed.')
    } finally {
      setMerging(false)
    }
  }

  if (result) {
    const keptName = keepId === ingredient.id ? ingredient.name : target?.name
    return (
      <Modal open onClose={() => { onMerged(); onClose() }} title="Merge Complete" size="sm"
        footer={<Button onClick={() => { onMerged(); onClose() }}>Done</Button>}
      >
        <p className={styles.resultBody}>
          Merged into <strong>{keptName}</strong>. Updated {result.recipes} recipe{result.recipes !== 1 ? 's' : ''},{' '}
          {result.groceryLists} grocery list{result.groceryLists !== 1 ? 's' : ''}, and {result.macroLogs} macro log{' '}
          entr{result.macroLogs !== 1 ? 'ies' : 'y'} to point at it.
        </p>
      </Modal>
    )
  }

  const keepIngredient = keepId === ingredient.id ? ingredient : target
  const mergeAwayIngredient = keepId === ingredient.id ? target : ingredient
  const mergeAwayName = target ? (keepId === ingredient.id ? target.name : ingredient.name) : ''
  const fieldConflicts = (keepIngredient && mergeAwayIngredient) ? getFieldConflicts(keepIngredient, mergeAwayIngredient) : []

  return (
    <Modal
      open
      onClose={onClose}
      title={`Merge "${ingredient.name}" with another ingredient`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {target && (
            <Button variant="danger" onClick={handleConfirm} disabled={merging}>
              {merging ? 'Merging…' : `Merge — Keep "${keepIngredient?.name}"`}
            </Button>
          )}
        </>
      }
    >
      {!target ? (
        <>
          <p className={styles.intro}>
            Search for the other ingredient this is really the same product as. Nothing changes until you confirm
            on the next step.
          </p>
          <IngredientPicker onPick={handlePick} placeholder="Search ingredients…" autoFocus />
          {error && <p className={styles.error}>{error}</p>}
        </>
      ) : (
        <div className={styles.compare}>
          <label className={styles.option}>
            <input type="radio" checked={keepId === ingredient.id} onChange={() => setKeepId(ingredient.id)} />
            <div>
              <div className={styles.optionName}>{ingredient.name}</div>
              <div className={styles.optionMeta}>
                {ingredient.variants[0]?.brand ?? 'Generic'} · {ingredient.category}
                {ingredient.variants[0]?.barcode ? ` · #${ingredient.variants[0].barcode}` : ''}
              </div>
              {counts && (
                <div className={styles.optionRefCount}>
                  {totalReferences(counts.self)} existing reference{totalReferences(counts.self) !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </label>
          <label className={styles.option}>
            <input type="radio" checked={keepId === target.id} onChange={() => setKeepId(target.id)} />
            <div>
              <div className={styles.optionName}>{target.name}</div>
              <div className={styles.optionMeta}>
                {target.variants[0]?.brand ?? 'Generic'} · {target.category}
                {target.variants[0]?.barcode ? ` · #${target.variants[0].barcode}` : ''}
              </div>
              {counts && (
                <div className={styles.optionRefCount}>
                  {totalReferences(counts.target)} existing reference{totalReferences(counts.target) !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </label>
          {ingredient.category !== target.category && (
            <label className={styles.categoryChoice}>
              <span className={styles.categoryChoiceLabel}>
                These disagree on category — pick which one to keep:
              </span>
              <select
                className={styles.categoryChoiceSelect}
                value={categoryChoice}
                onChange={e => setCategoryChoice(e.target.value)}
              >
                <option value={ingredient.category}>{ingredient.category} ({ingredient.name})</option>
                <option value={target.category}>{target.category} ({target.name})</option>
              </select>
            </label>
          )}

          {fieldConflicts.length > 0 && (
            <div className={styles.fieldConflicts}>
              <p className={styles.fieldConflictsLabel}>
                These also disagree — only {keepIngredient?.name}'s values will be kept:
              </p>
              <ul className={styles.fieldConflictsList}>
                {fieldConflicts.map(c => (
                  <li key={c.field}><strong>{c.field}:</strong> keeping "{c.kept}", discarding "{c.discarded}"</li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.warning}>
            <strong>{mergeAwayName}</strong> will be permanently deleted. Every recipe, grocery list, and macro log
            that referenced it will be repointed to <strong>{keepIngredient?.name}</strong> first. This cannot be
            undone.
          </p>
          <button type="button" className={styles.changeTarget} onClick={() => { setTarget(null); setCounts(null) }}>
            ← Search for a different ingredient
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </Modal>
  )
}
