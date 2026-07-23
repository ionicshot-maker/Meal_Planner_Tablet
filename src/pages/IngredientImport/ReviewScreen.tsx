import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, NumericInput, Select, Toggle, Card, Modal } from '@/components/ui'
import { BrandCombobox } from '@/components/BrandCombobox'
import { InfoDot } from '@/components/QualityBadges'
import { AllergenPicker } from '@/components/AllergenChips'
import { parseFraction, formatNumeric } from '@/utils/fractionInput'
// useRef / parseFraction / formatNumeric used by MacroField below
import { useSettings } from '@/context/SettingsContext'
import { getAllIngredients, saveIngredient, calcCostPerServing } from '@/db/ingredients'
import { newId, now } from '@/utils/ids'
import { availableUnits } from '@/utils/units'
import { findSmartMatches, findBarcodeMatch, findMatchingVariant } from '@/utils/smartDuplicate'
import { normalizeBrandName } from '@/utils/brandNormalization'
import { NUTRISCORE_DESCRIPTIONS, NOVA_DESCRIPTIONS } from '@/utils/ingredientQuality'
import { ScrollHint } from '@/components/ScrollHint'
import { Toast } from './Toast'
import type { Ingredient, IngredientVariant, IngredientUnit, Macros, NutritionSource, NutriscoreGrade, NovaGroupNum } from '@/types'
import styles from './ReviewScreen.module.css'

const NUTRISCORE_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'E', label: 'E' },
]

const NOVA_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: '1', label: '1 — Unprocessed' },
  { value: '2', label: '2 — Minimally Processed' },
  { value: '3', label: '3 — Processed' },
  { value: '4', label: '4 — Ultra Processed' },
]

const BLANK_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 }

const DRAFT_KEY = 'ingredient_import_draft'

interface SmartMatchState {
  matches: Ingredient[]
  draft: Ingredient
}

interface ToastState {
  message: string
  onDone: () => void
}

const SOURCE_LABELS: Record<NutritionSource, string> = {
  openfoodfacts: 'Open Food Facts',
  gemini:        'Gemini AI',
  usda:          'USDA FoodData Central',
  manual:        'Manual',
}

interface ReviewNotice {
  level: 'success' | 'warning'
  message: string
}

interface Props {
  draft: Ingredient
  onSaved: (ingredient: Ingredient) => void
  onCancel: () => void
  onSearchUSDA?: () => void
  nutritionSource?: NutritionSource
  /** Field keys (name, servingSize, or a Macros key) to highlight in amber — used when a
   *  photo/AI-driven import could not confidently read some values. */
  uncertainFields?: Set<string>
  /** Overrides the default source-based accuracy banner with a specific message, e.g. from
   *  a nutrition label scan that already knows whether the read was confident or partial. */
  notice?: ReviewNotice
}

export function ReviewScreen({ draft: initialDraft, onSaved, onCancel, onSearchUSDA, nutritionSource, uncertainFields, notice }: Props) {
  const { settings, updateSettings } = useSettings()
  const [draft, setDraft] = useState<Ingredient>(() => ensureVariant(initialDraft))
  const [saving, setSaving] = useState(false)
  const [smartMatches, setSmartMatches] = useState<SmartMatchState | null>(null)
  const [barcodeMatch, setBarcodeMatch] = useState<Ingredient | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const handleSaveDraft = useCallback(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      ingredient: draft,
      nutritionSource: nutritionSource ?? 'manual',
      savedAt: new Date().toISOString(),
    }))
    setDraftSaved(true)
    setTimeout(() => setDraftSaved(false), 2500)
  }, [draft, nutritionSource])

  const units = availableUnits(settings.unitSystem).map(u => ({ value: u, label: u }))
  const categoryOptions = settings.ingredientCategories.map(c => ({ value: c, label: c }))
  const v = draft.variants[0]

  useEffect(() => {
    setDraft(ensureVariant(initialDraft))
  }, [initialDraft])

  function setField<K extends keyof Ingredient>(key: K, value: Ingredient[K]) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  function setVariantField(patch: Partial<IngredientVariant>) {
    setDraft(d => {
      const current = d.variants[0]
      const priceStamp = patch.packageCost != null && patch.packageCost !== current.packageCost
        ? { priceLastUpdated: now() }
        : {}
      return { ...d, variants: [{ ...current, ...patch, ...priceStamp }] }
    })
  }

  function setMacro(key: keyof Macros, value: number) {
    setVariantField({ macros: { ...v.macros, [key]: value } })
  }

  const costPerServing = v.packageCost && v.totalServingsInPackage
    ? (v.packageCost / v.totalServingsInPackage).toFixed(3)
    : null

  async function handleSave() {
    if (!draft.name.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const all = await getAllIngredients(true)

      // Barcode is the primary identifier — if it matches an existing product,
      // that takes priority over any name/brand comparison.
      const draftBarcode = draft.variants[0]?.barcode
      const byBarcode = findBarcodeMatch(draftBarcode, all)
      if (byBarcode) {
        setBarcodeMatch(byBarcode)
        setSaving(false)
        return
      }

      const matches = findSmartMatches(draft.name.trim(), all)
      if (matches.length === 0) {
        await commitSave(draft)
        return
      }
      // A fuzzy match is never sufficient justification to merge
      // automatically, even when there's only one candidate — a lone fuzzy
      // match just means only one existing ingredient happened to satisfy a
      // loose keyword-subset/edit-distance check, not that it's actually the
      // same product. Confirmed real: "Turkey Bacon" fuzzy-matches "Bacon" in
      // the live starter library and would previously have been silently
      // merged in as a Bacon variant with zero confirmation (2026-07-24 audit
      // finding, see MealPlannerApp_Reference.md). Always show the compare
      // modal now and require an explicit pick, regardless of match count.
      setSmartMatches({ matches, draft })
      setSaving(false)
    } catch (err) {
      setSaving(false)
      setSaveError(err instanceof Error ? err.message : 'Could not save this ingredient — please try again.')
    }
  }

  async function commitSave(ingredient: Ingredient) {
    const toSave: Ingredient = {
      ...ingredient,
      name: ingredient.name.trim(),
      updatedAt: now(),
      defaultVariantId: ingredient.variants[0].id,
      variants: ingredient.variants.map(variant => ({
        ...variant,
        brand: normalizeBrandName(variant.brand) || 'Generic',
        costPerServing: calcCostPerServing(variant),
      })),
    }
    await saveIngredient(toSave)
    await autoAddBrand(toSave.variants[0]?.brand)
    onSaved(toSave)
  }

  // Barcode already exists on another ingredient — offer to fold the new data
  // into that existing variant, or skip saving this one entirely.
  async function handleUpdateBarcodeMatch() {
    if (!barcodeMatch) return
    setSaving(true)
    const draftVariant = draft.variants[0]
    // findMatchingVariant, not a plain === check — barcodeMatch may have been
    // found via the leading-zero-equivalent tier (findBarcodeMatch), in which
    // case the stored variant's barcode string isn't literally identical to
    // draftVariant.barcode even though they identify the same product.
    const matchedVariant = findMatchingVariant(draftVariant.barcode, barcodeMatch)
    const updated: Ingredient = {
      ...barcodeMatch,
      variants: barcodeMatch.variants.map(v => v.id === matchedVariant?.id
        ? {
            ...draftVariant,
            id: v.id,
            parentId: barcodeMatch.id,
            brand: normalizeBrandName(draftVariant.brand) || 'Generic',
            costPerServing: calcCostPerServing(draftVariant),
          }
        : v
      ),
      updatedAt: now(),
    }
    await saveIngredient(updated)
    await autoAddBrand(draftVariant.brand)
    setBarcodeMatch(null)
    setSaving(false)
    setToast({ message: `Updated ${updated.name}`, onDone: () => onSaved(updated) })
  }

  function handleSkipBarcodeMatch() {
    setBarcodeMatch(null)
    onCancel()
  }

  async function autoAddBrand(brand: string | undefined) {
    const b = brand?.trim()
    if (!b || b.toLowerCase() === 'generic') return
    const existing = settings.brands ?? []
    if (!existing.some(x => x.toLowerCase() === b.toLowerCase())) {
      await updateSettings({ brands: [...existing, b].sort((a, c) => a.localeCompare(c)) })
    }
  }

  async function addAsVariantOf(parent: Ingredient, d: Ingredient) {
    setSaving(true)
    const newVariant: IngredientVariant = {
      ...d.variants[0],
      id: newId(),
      parentId: parent.id,
      brand: normalizeBrandName(d.variants[0].brand) || 'Generic',
    }
    const updated: Ingredient = {
      ...parent,
      variants: [...parent.variants, newVariant],
      updatedAt: now(),
    }
    await saveIngredient(updated)
    await autoAddBrand(d.variants[0]?.brand)
    setSmartMatches(null)
    setSaving(false)
    setToast({ message: `Added as a variant of ${parent.name}`, onDone: () => onSaved(updated) })
  }

  async function handleSaveAsNew() {
    if (!smartMatches) return
    setSaving(true)
    setSaveError('')
    try {
      await commitSave(smartMatches.draft)
    } catch (err) {
      setSaving(false)
      setSaveError(err instanceof Error ? err.message : 'Could not save this ingredient — please try again.')
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.scrollArea} ref={scrollAreaRef}>
        {notice ? (
          <div className={notice.level === 'success' ? styles.successNotice : styles.accuracyWarning}>
            <strong>{notice.level === 'success' ? '✅ ' : '⚠️ '}{notice.message}</strong>
          </div>
        ) : (nutritionSource === 'openfoodfacts' || nutritionSource === 'gemini') && (
          <div className={styles.accuracyWarning}>
            <strong>⚠️ Please compare these nutrition values to the label on your product before saving</strong>{' '}
            — data may not be exact.
          </div>
        )}

        {onSearchUSDA && (
          <div className={styles.nutritionWarning}>
            <p className={styles.nutritionWarningText}>
              <strong>Nutritional info unavailable from barcode scan</strong> — we found the product
              but the database does not have complete nutrition data for it. You can fill in the
              values manually below, or search by name in the USDA tab for better results.
            </p>
            <button className={styles.nutritionWarningBtn} onClick={onSearchUSDA}>
              Search USDA for this product
            </button>
          </div>
        )}

        <Card padding="md">
          <h3 className={styles.sectionTitle}>Basic Info</h3>
          <div className={styles.row2}>
            <Input
              label="Ingredient Name *"
              value={draft.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="e.g. Chicken Breast"
              className={uncertainFields?.has('name') ? styles.fieldWarning : undefined}
            />
            <Select
              label="Category"
              options={categoryOptions}
              value={draft.category}
              onChange={e => setField('category', e.target.value)}
            />
          </div>
          <div className={styles.toggleRow}>
            <Toggle label="Perishable" checked={draft.perishable} onChange={v => setField('perishable', v)} />
            {draft.perishable && (
              <Toggle label="Frozen" checked={draft.frozen} onChange={v => setField('frozen', v)} />
            )}
            <Toggle label="Always on hand" checked={draft.alwaysOnHand} onChange={v => setField('alwaysOnHand', v)} />
          </div>
        </Card>

        <Card padding="md">
          <h3 className={styles.sectionTitle}>Brand / Variant</h3>
          <div className={styles.row2}>
            <BrandCombobox
              value={v.brand}
              onChange={brand => setVariantField({ brand })}
            />
            {settings.storePreferenceEnabled && (
              <Input
                label="Store"
                value={v.store ?? ''}
                onChange={e => setVariantField({ store: e.target.value })}
                placeholder="e.g. Walmart"
              />
            )}
          </div>
          <div className={styles.row3}>
            <NumericInput
              label="Serving Size"
              value={v.servingSize}
              onChange={n => setVariantField({ servingSize: n ?? 0 })}
              placeholder="e.g. 1, 1/4, ½"
              className={uncertainFields?.has('servingSize') ? styles.fieldWarning : undefined}
            />
            <Select
              label="Serving Unit"
              options={units}
              value={v.servingUnit}
              onChange={e => setVariantField({ servingUnit: e.target.value as IngredientUnit })}
            />
            <Select
              label="Default Unit"
              options={units}
              value={v.defaultUnit}
              onChange={e => setVariantField({ defaultUnit: e.target.value as IngredientUnit })}
            />
          </div>
          <div className={styles.row3}>
            <NumericInput
              label="Package Cost ($)"
              value={v.packageCost}
              onChange={n => setVariantField({ packageCost: n })}
              placeholder="e.g. 3.49"
            />
            <NumericInput
              label="Servings per Package"
              value={v.totalServingsInPackage}
              onChange={n => setVariantField({ totalServingsInPackage: n })}
            />
            <div className={styles.costDisplay}>
              <span className={styles.costLabel}>Cost / serving</span>
              <span className={styles.costValue}>{costPerServing ? `$${costPerServing}` : '—'}</span>
            </div>
          </div>
          {v.usdaFdcId && (
            <p className={styles.fdcNote}>USDA FDC ID: {v.usdaFdcId}</p>
          )}

          <div className={styles.row2} style={{ marginTop: 'var(--space-3)' }}>
            <Input
              label="Barcode (UPC/EAN)"
              value={v.barcode ?? ''}
              onChange={e => setVariantField({ barcode: e.target.value || undefined })}
              placeholder="e.g. 038000845017"
            />
            <div>
              <div className={styles.qualityLabelRow}>
                <span className={styles.qualityLabel}>Nutriscore Grade</span>
                <InfoDot text={
                  v.nutriscore
                    ? `Nutriscore ${v.nutriscore} — ${NUTRISCORE_DESCRIPTIONS[v.nutriscore]}`
                    : 'A nutrition quality score from A (best) to E (worst), calculated per 100g.'
                } />
              </div>
              <Select
                options={NUTRISCORE_OPTIONS}
                value={v.nutriscore ?? ''}
                onChange={e => setVariantField({ nutriscore: (e.target.value || undefined) as NutriscoreGrade | undefined })}
              />
            </div>
          </div>
          <div className={styles.row2} style={{ marginTop: 'var(--space-3)' }}>
            <div>
              <div className={styles.qualityLabelRow}>
                <span className={styles.qualityLabel}>Nova Group</span>
                <InfoDot text={
                  v.novaGroup
                    ? `Nova ${v.novaGroup} — ${NOVA_DESCRIPTIONS[v.novaGroup]}`
                    : 'A food processing classification from 1 (unprocessed) to 4 (ultra processed).'
                } />
              </div>
              <Select
                options={NOVA_OPTIONS}
                value={v.novaGroup != null ? String(v.novaGroup) : ''}
                onChange={e => setVariantField({ novaGroup: (e.target.value ? Number(e.target.value) : undefined) as NovaGroupNum | undefined })}
              />
            </div>
            <div>
              <div className={styles.qualityLabelRow}>
                <span className={styles.qualityLabel}>Allergens</span>
              </div>
              <AllergenPicker
                selected={v.allergens ?? []}
                onChange={allergens => setVariantField({ allergens: allergens.length ? allergens : undefined })}
              />
            </div>
          </div>
        </Card>

        <Card padding="md">
          <h3 className={styles.sectionTitle}>Nutrients (per serving)</h3>
          {nutritionSource && nutritionSource !== 'manual' && (
            <div className={styles.sourceBadge}>
              Source: {SOURCE_LABELS[nutritionSource]}
            </div>
          )}
          <p className={styles.verifyNote}>
            Please verify nutrition values against the product label before saving.
          </p>
          <div className={styles.macroGrid}>
            {([
              ['calories', 'Calories', 'kcal'],
              ['protein',  'Protein',  'g'],
              ['carbs',    'Carbs',    'g'],
              ['fiber',    'Fiber',    'g'],
              ['sugar',    'Sugar',    'g'],
              ['fat',      'Fat',      'g'],
              ['sodium',   'Sodium',   'mg'],
            ] as [keyof Macros, string, string][]).map(([key, label, unit]) => (
              <MacroField key={key} label={label} unit={unit} value={v.macros?.[key] ?? 0} onChange={n => setMacro(key, n)} warning={uncertainFields?.has(key)} />
            ))}
            {settings.nutrientToggles.saturatedFat && (
              <MacroField label="Sat. Fat" unit="g" value={v.macros?.saturatedFat ?? 0} onChange={n => setMacro('saturatedFat', n)} warning={uncertainFields?.has('saturatedFat')} />
            )}
            {settings.nutrientToggles.transFat && (
              <MacroField label="Trans Fat" unit="g" value={v.macros?.transFat ?? 0} onChange={n => setMacro('transFat', n)} warning={uncertainFields?.has('transFat')} />
            )}
          </div>
        </Card>
      </div>

      <ScrollHint targetRef={scrollAreaRef} className={styles.scrollHint} />

      {saveError && <p className={styles.saveError}>⚠ {saveError}</p>}

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onCancel}>Back</Button>
        <span className={styles.footerSpacer} />
        {draftSaved && <span className={styles.draftMsg}>Draft saved</span>}
        <Button variant="ghost" size="sm" onClick={handleSaveDraft}>Save Draft</Button>
        <Button onClick={handleSave} disabled={saving || !draft.name.trim()}>
          {saving ? 'Saving…' : 'Save Ingredient'}
        </Button>
      </div>

      {barcodeMatch && (
        <Modal
          open
          onClose={() => setBarcodeMatch(null)}
          title="Barcode Already Exists"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBarcodeMatch(null)}>Cancel</Button>
              <Button variant="secondary" onClick={handleSkipBarcodeMatch}>Skip</Button>
              <Button onClick={handleUpdateBarcodeMatch} disabled={saving}>Update Existing</Button>
            </>
          }
        >
          <p className={styles.dupDesc}>
            This barcode already exists in your database as <strong>{barcodeMatch.name}</strong>.
            Would you like to update it with this new data, or skip saving this one?
          </p>
        </Modal>
      )}

      {smartMatches && (
        <Modal
          open
          onClose={() => { setSmartMatches(null); setSaving(false) }}
          title={smartMatches.matches.length === 1 ? 'Similar Ingredient Found' : 'Similar Ingredients Found'}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setSmartMatches(null); setSaving(false) }}>Cancel</Button>
              <Button variant="secondary" onClick={handleSaveAsNew} disabled={saving}>Save as New</Button>
            </>
          }
        >
          <p className={styles.dupDesc}>
            {smartMatches.matches.length === 1
              ? "This name matched an existing ingredient, but a name match alone doesn't confirm it's the same product — compare the details below before deciding."
              : 'These existing ingredients have similar names — compare the details below before deciding. Add this as a variant of one, or save it as a new ingredient.'}
          </p>

          <div className={styles.dupCompareLabel}>You're saving:</div>
          <IngredientCompareCard ingredient={smartMatches.draft} />

          {smartMatches.matches.map(m => {
            const draftBrand = normalizeBrandName(smartMatches.draft.variants[0]?.brand).toLowerCase()
            const brandExists = m.variants.some(v => (v.brand ?? '').trim().toLowerCase() === draftBrand)
            return (
              <div key={m.id} className={styles.dupMatch}>
                <div className={styles.dupCompareLabel}>Existing ingredient:</div>
                <IngredientCompareCard ingredient={m} />
                {brandExists && (
                  <div className={styles.dupMatchWarn}>
                    Brand "{smartMatches.draft.variants[0]?.brand}" already exists on this ingredient
                  </div>
                )}
                <Button size="sm" onClick={() => addAsVariantOf(m, smartMatches.draft)} disabled={saving}>
                  Merge — Add as Variant of "{m.name}"
                </Button>
              </div>
            )
          })}
        </Modal>
      )}

      {toast && <Toast message={toast.message} onDone={toast.onDone} />}
    </div>
  )
}

// ─── Compact macro number field with fraction support ────────────────────────
function MacroField({ label, unit, value, onChange, warning }: {
  label: string; unit: string; value: number; onChange: (v: number) => void; warning?: boolean
}) {
  const [text, setText] = useState(formatNumeric(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(formatNumeric(value))
  }, [value])

  function handleBlur() {
    focused.current = false
    const raw = text.trim()
    const normalized = /^\.\d/.test(raw) ? '0' + raw : raw
    const parsed = parseFraction(normalized)
    if (parsed !== null && isFinite(parsed)) {
      onChange(parsed)
      setText(formatNumeric(parsed))
    } else {
      setText(formatNumeric(value))
    }
  }

  return (
    <div className={styles.macroField}>
      <label className={styles.macroLabel}>{label}</label>
      <div className={`${styles.macroInput} ${warning ? styles.fieldWarning : ''}`}>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => { focused.current = true }}
          onBlur={handleBlur}
          className={styles.macroNumber}
        />
        <span className={styles.macroUnit}>{unit}</span>
      </div>
    </div>
  )
}

// Compact side-by-side comparison card — shows enough to actually judge
// "is this the same product" (name, brand, category, key macros, barcode),
// not just a bare name. Used for both the not-yet-saved draft and each
// existing-ingredient candidate in the Similar Ingredient(s) Found modal, so
// a fuzzy name match can be visually confirmed or rejected rather than
// trusted on the strength of the name alone.
function IngredientCompareCard({ ingredient }: { ingredient: Ingredient }) {
  const variant = ingredient.variants[0]
  const m = variant?.macros
  return (
    <div className={styles.dupCompareCard}>
      <div className={styles.dupCompareName}>{ingredient.name}</div>
      <div className={styles.dupCompareMeta}>
        {variant?.brand || 'Generic'} · {ingredient.category}
        {variant?.barcode ? ` · #${variant.barcode}` : ''}
      </div>
      {m && (
        <div className={styles.dupCompareMacros}>
          {Math.round(m.calories)} cal · {m.protein}g protein · {m.carbs}g carbs · {m.fat}g fat
        </div>
      )}
    </div>
  )
}

function ensureVariant(ingredient: Ingredient): Ingredient {
  if (ingredient.variants.length > 0) return ingredient
  const variantId = newId()
  return {
    ...ingredient,
    variants: [{
      id: variantId,
      parentId: ingredient.id,
      brand: 'Generic',
      defaultUnit: 'g',
      servingSize: 100,
      servingUnit: 'g',
      macros: { ...BLANK_MACROS },
    }],
    defaultVariantId: variantId,
  }
}
