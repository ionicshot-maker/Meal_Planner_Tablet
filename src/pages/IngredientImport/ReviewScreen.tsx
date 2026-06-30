import { useState, useEffect, useRef } from 'react'
import { Button, Input, NumericInput, Select, Toggle, Card, Modal } from '@/components/ui'
import { parseFraction, formatNumeric } from '@/utils/fractionInput'
// useRef / parseFraction / formatNumeric used by MacroField below
import { useSettings } from '@/context/SettingsContext'
import { getAllIngredients, saveIngredient, calcCostPerServing } from '@/db/ingredients'
import { newId, now } from '@/utils/ids'
import { availableUnits } from '@/utils/units'
import type { Ingredient, IngredientVariant, IngredientUnit, Macros, NutritionSource } from '@/types'
import styles from './ReviewScreen.module.css'

const BLANK_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 }

interface DuplicateState {
  existing: Ingredient
  draft: Ingredient
}

const SOURCE_LABELS: Record<NutritionSource, string> = {
  openfoodfacts: 'Open Food Facts',
  gemini:        'Gemini AI',
  usda:          'USDA FoodData Central',
  manual:        'Manual',
}

interface Props {
  draft: Ingredient
  onSaved: (name: string) => void
  onCancel: () => void
  onSearchUSDA?: () => void
  nutritionSource?: NutritionSource
}

export function ReviewScreen({ draft: initialDraft, onSaved, onCancel, onSearchUSDA, nutritionSource }: Props) {
  const { settings } = useSettings()
  const [draft, setDraft] = useState<Ingredient>(() => ensureVariant(initialDraft))
  const [saving, setSaving] = useState(false)
  const [duplicate, setDuplicate] = useState<DuplicateState | null>(null)

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
    setDraft(d => ({
      ...d,
      variants: [{ ...d.variants[0], ...patch }],
    }))
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
    try {
      const all = await getAllIngredients(true)
      const existing = all.find(i => i.name.toLowerCase() === draft.name.trim().toLowerCase())
      if (existing) {
        setDuplicate({ existing, draft })
        setSaving(false)
        return
      }
      await commitSave(draft)
    } catch {
      setSaving(false)
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
        costPerServing: calcCostPerServing(variant),
      })),
    }
    await saveIngredient(toSave)
    onSaved(toSave.name)
  }

  async function saveAsNewVariant() {
    if (!duplicate) return
    setSaving(true)
    const { existing, draft: d } = duplicate
    const newVariant: IngredientVariant = {
      ...d.variants[0],
      id: newId(),
      parentId: existing.id,
    }
    const updated: Ingredient = {
      ...existing,
      variants: [...existing.variants, newVariant],
      updatedAt: now(),
    }
    await saveIngredient(updated)
    setDuplicate(null)
    onSaved(existing.name)
  }

  async function saveAsNewIngredient() {
    if (!duplicate) return
    setSaving(true)
    const toSave: Ingredient = {
      ...duplicate.draft,
      id: newId(),
      name: duplicate.draft.name.trim(),
      createdAt: now(),
      updatedAt: now(),
      defaultVariantId: duplicate.draft.variants[0].id,
      variants: duplicate.draft.variants.map(variant => ({
        ...variant,
        costPerServing: calcCostPerServing(variant),
      })),
    }
    await saveIngredient(toSave)
    setDuplicate(null)
    onSaved(toSave.name)
  }

  return (
    <div className={styles.container}>
      <div className={styles.scrollArea}>
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
            <Input
              label="Brand Name"
              value={v.brand}
              onChange={e => setVariantField({ brand: e.target.value })}
              placeholder="Generic"
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
              <MacroField key={key} label={label} unit={unit} value={v.macros[key] ?? 0} onChange={n => setMacro(key, n)} />
            ))}
            {settings.nutrientToggles.saturatedFat && (
              <MacroField label="Sat. Fat" unit="g" value={v.macros.saturatedFat ?? 0} onChange={n => setMacro('saturatedFat', n)} />
            )}
            {settings.nutrientToggles.transFat && (
              <MacroField label="Trans Fat" unit="g" value={v.macros.transFat ?? 0} onChange={n => setMacro('transFat', n)} />
            )}
          </div>
        </Card>
      </div>

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onCancel}>Back</Button>
        <Button onClick={handleSave} disabled={saving || !draft.name.trim()}>
          {saving ? 'Saving…' : 'Save Ingredient'}
        </Button>
      </div>

      {duplicate && (
        <Modal
          open
          onClose={() => { setDuplicate(null); setSaving(false) }}
          title="Duplicate Found"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setDuplicate(null); setSaving(false) }}>Cancel</Button>
              <Button variant="secondary" onClick={saveAsNewIngredient} disabled={saving}>Save as New</Button>
              <Button onClick={saveAsNewVariant} disabled={saving}>Add as Variant</Button>
            </>
          }
        >
          <p>
            <strong>{duplicate.existing.name}</strong> already exists in your ingredient database.
          </p>
          <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            "Add as Variant" adds this brand to the existing ingredient.
            "Save as New" creates a separate ingredient entry.
          </p>
        </Modal>
      )}
    </div>
  )
}

// ─── Compact macro number field with fraction support ────────────────────────
function MacroField({ label, unit, value, onChange }: {
  label: string; unit: string; value: number; onChange: (v: number) => void
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
      <div className={styles.macroInput}>
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
