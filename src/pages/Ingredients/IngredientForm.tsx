import { useState, useRef, useEffect } from 'react'
import { Button, Input, NumericInput, Select, Toggle, Modal, Card } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { newId, now } from '@/utils/ids'
import { availableUnits } from '@/utils/units'
import { calcCostPerServing } from '@/db/ingredients'
import { parseFraction, formatNumeric } from '@/utils/fractionInput'
import type { Ingredient, IngredientVariant, IngredientUnit, Macros } from '@/types'
import styles from './IngredientForm.module.css'

const BLANK_MACROS: Macros = {
  calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0,
}

interface Props {
  ingredient: Ingredient
  onSave: (ingredient: Ingredient) => Promise<void>
  onClose: () => void
}

export function IngredientForm({ ingredient, onSave, onClose }: Props) {
  const { settings } = useSettings()
  const [draft, setDraft] = useState<Ingredient>({
    ...ingredient,
    variants: ingredient.variants.length > 0 ? ingredient.variants : [{
      id: newId(),
      parentId: ingredient.id,
      brand: 'Generic',
      defaultUnit: 'oz',
      servingSize: 1,
      servingUnit: 'oz',
      macros: { ...BLANK_MACROS },
    }],
    defaultVariantId: ingredient.defaultVariantId || ingredient.variants[0]?.id || '',
  })
  const [editingVariantId, setEditingVariantId] = useState<string | null>(
    draft.defaultVariantId || draft.variants[0]?.id || null
  )
  const [saving, setSaving] = useState(false)
  const [usdaQuery, setUsdaQuery] = useState('')
  const [usdaResults, setUsdaResults] = useState<USDAFoodItem[]>([])
  const [usdaSearching, setUsdaSearching] = useState(false)

  const units = availableUnits(settings.unitSystem).map(u => ({ value: u, label: u }))
  const categoryOptions = settings.ingredientCategories.map(c => ({ value: c, label: c }))

  const activeVariant = draft.variants.find(v => v.id === editingVariantId) ?? draft.variants[0]

  function setDraftField<K extends keyof Ingredient>(key: K, value: Ingredient[K]) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  function updateVariant(patch: Partial<IngredientVariant>) {
    setDraft(d => ({
      ...d,
      variants: d.variants.map(v =>
        v.id === editingVariantId ? { ...v, ...patch } : v
      ),
    }))
  }

  function updateMacro(key: keyof Macros, value: number) {
    if (!activeVariant) return
    updateVariant({ macros: { ...activeVariant.macros, [key]: value } })
  }

  function addVariant() {
    const v: IngredientVariant = {
      id: newId(),
      parentId: draft.id,
      brand: 'New Brand',
      defaultUnit: activeVariant?.defaultUnit ?? 'oz',
      servingSize: activeVariant?.servingSize ?? 1,
      servingUnit: activeVariant?.servingUnit ?? 'oz',
      macros: { ...BLANK_MACROS },
    }
    setDraft(d => ({ ...d, variants: [...d.variants, v] }))
    setEditingVariantId(v.id)
  }

  function removeVariant(id: string) {
    const next = draft.variants.filter(v => v.id !== id)
    setDraft(d => ({
      ...d,
      variants: next,
      defaultVariantId: d.defaultVariantId === id ? (next[0]?.id ?? '') : d.defaultVariantId,
    }))
    if (editingVariantId === id) setEditingVariantId(next[0]?.id ?? null)
  }

  async function searchUSDA() {
    if (!usdaQuery.trim()) return
    setUsdaSearching(true)
    try {
      const key = settings.usdaApiKey || 'DEMO_KEY'
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(usdaQuery)}&dataType=SR%20Legacy,Foundation&pageSize=8&api_key=${key}`
      const res = await fetch(url)
      const json = await res.json()
      setUsdaResults(json.foods ?? [])
    } catch {
      alert('USDA search failed. Check your internet connection.')
    } finally {
      setUsdaSearching(false)
    }
  }

  function applyUSDAFood(food: USDAFoodItem) {
    const getNutrient = (id: number) =>
      food.foodNutrients.find(n => n.nutrientId === id)?.value ?? 0

    const macros: Macros = {
      calories:  getNutrient(1008),
      protein:   getNutrient(1003),
      carbs:     getNutrient(1005),
      fiber:     getNutrient(1079),
      sugar:     getNutrient(2000),
      fat:       getNutrient(1004),
      sodium:    getNutrient(1093),
      saturatedFat: getNutrient(1258) || undefined,
      transFat:  getNutrient(1257) || undefined,
    }

    updateVariant({
      macros,
      usdaFdcId: food.fdcId,
      servingSize: food.servingSize ?? 100,
      servingUnit: (food.servingSizeUnit?.toLowerCase() as IngredientUnit) ?? 'g',
    })
    setUsdaResults([])
    setUsdaQuery('')
  }

  async function handleSave() {
    if (!draft.name.trim()) return alert('Ingredient name is required.')
    if (draft.variants.length === 0) return alert('At least one brand/variant is required.')

    setSaving(true)
    const toSave: Ingredient = {
      ...draft,
      updatedAt: now(),
      defaultVariantId: draft.defaultVariantId || draft.variants[0].id,
      variants: draft.variants.map(v => ({
        ...v,
        costPerServing: calcCostPerServing(v),
      })),
    }
    await onSave(toSave)
    setSaving(false)
  }

  const isNew = !ingredient.name

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add Ingredient' : `Edit ${ingredient.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className={styles.form}>
        {/* Basic info */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Basic Info</h3>
          <div className={styles.row2}>
            <Input
              label="Ingredient Name *"
              value={draft.name}
              onChange={e => setDraftField('name', e.target.value)}
              placeholder="e.g. Ketchup"
            />
            <Select
              label="Category"
              options={categoryOptions}
              value={draft.category}
              onChange={e => setDraftField('category', e.target.value)}
            />
          </div>
          <div className={styles.toggleRow}>
            <Toggle label="Perishable" checked={draft.perishable} onChange={v => setDraftField('perishable', v)} />
            {draft.perishable && (
              <Toggle label="Frozen" checked={draft.frozen} onChange={v => setDraftField('frozen', v)} />
            )}
            <Toggle label="Always on hand" checked={draft.alwaysOnHand} onChange={v => setDraftField('alwaysOnHand', v)} />
          </div>
          {settings.storePreferenceEnabled && (
            <Input label="Store" value={draft.variants[0]?.store ?? ''} onChange={e => updateVariant({ store: e.target.value })} placeholder="e.g. Walmart" />
          )}
        </section>

        {/* Brand / Variant tabs */}
        <section className={styles.section}>
          <div className={styles.variantHeader}>
            <h3 className={styles.sectionTitle}>Brands / Variants</h3>
            <Button size="sm" variant="secondary" onClick={addVariant}>+ Add Brand</Button>
          </div>
          {draft.variants.length > 1 && (
            <div className={styles.variantTabs}>
              {draft.variants.map(v => (
                <button
                  key={v.id}
                  className={`${styles.variantTab} ${v.id === editingVariantId ? styles.variantTabActive : ''}`}
                  onClick={() => setEditingVariantId(v.id)}
                >
                  {v.brand}
                  {v.id === draft.defaultVariantId && ' ★'}
                </button>
              ))}
            </div>
          )}

          {activeVariant && (
            <Card padding="sm">
              <div className={styles.row2}>
                <Input
                  label="Brand Name"
                  value={activeVariant.brand}
                  onChange={e => updateVariant({ brand: e.target.value })}
                />
                <div className={styles.actions}>
                  {draft.variants.length > 1 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDraftField('defaultVariantId', activeVariant.id)}
                      disabled={activeVariant.id === draft.defaultVariantId}
                    >
                      {activeVariant.id === draft.defaultVariantId ? '★ Default' : 'Set as Default'}
                    </Button>
                  )}
                  {draft.variants.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeVariant(activeVariant.id)}>Remove</Button>
                  )}
                </div>
              </div>

              <div className={styles.row3}>
                <NumericInput
                  label="Serving Size"
                  value={activeVariant.servingSize}
                  onChange={n => updateVariant({ servingSize: n ?? 0 })}
                  placeholder="e.g. 1, 1/4, ½"
                />
                <Select
                  label="Serving Unit"
                  options={units}
                  value={activeVariant.servingUnit}
                  onChange={e => updateVariant({ servingUnit: e.target.value as IngredientUnit })}
                />
                <Select
                  label="Default Unit"
                  options={units}
                  value={activeVariant.defaultUnit}
                  onChange={e => updateVariant({ defaultUnit: e.target.value as IngredientUnit })}
                />
              </div>

              <div className={styles.row3}>
                <NumericInput
                  label="Package Cost ($)"
                  value={activeVariant.packageCost}
                  onChange={n => updateVariant({ packageCost: n })}
                  placeholder="e.g. 2.37"
                />
                <NumericInput
                  label="Servings per Package"
                  value={activeVariant.totalServingsInPackage}
                  onChange={n => updateVariant({ totalServingsInPackage: n })}
                />
                <div className={styles.costDisplay}>
                  <span className={styles.costLabel}>Cost / serving</span>
                  <span className={styles.costValue}>
                    {activeVariant.packageCost && activeVariant.totalServingsInPackage
                      ? `$${(activeVariant.packageCost / activeVariant.totalServingsInPackage).toFixed(3)}`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* USDA search */}
              <div className={styles.usdaSection}>
                <span className={styles.usdaLabel}>Auto-fill macros from USDA FoodData Central</span>
                <div className={styles.usdaRow}>
                  <Input
                    placeholder="Search USDA…"
                    value={usdaQuery}
                    onChange={e => setUsdaQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') searchUSDA() }}
                  />
                  <Button size="sm" variant="secondary" onClick={searchUSDA} disabled={usdaSearching}>
                    {usdaSearching ? '…' : 'Search'}
                  </Button>
                </div>
                {usdaResults.length > 0 && (
                  <div className={styles.usdaResults}>
                    {usdaResults.map(food => (
                      <button
                        key={food.fdcId}
                        className={styles.usdaResult}
                        onClick={() => applyUSDAFood(food)}
                      >
                        <span className={styles.usdaName}>{food.description}</span>
                        <span className={styles.usdaMeta}>
                          {food.foodNutrients.find(n => n.nutrientId === 1008)?.value ?? '?'} cal
                          · {food.dataType}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {activeVariant.usdaFdcId && (
                  <p className={styles.usdaLinked}>FDC ID: {activeVariant.usdaFdcId}</p>
                )}
              </div>

              {/* Macros */}
              <h4 className={styles.macroTitle}>Nutrients (per serving)</h4>
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
                  <FormMacroField
                    key={key}
                    label={label}
                    unit={unit}
                    value={activeVariant.macros[key] ?? 0}
                    onChange={n => updateMacro(key, n)}
                  />
                ))}
                {settings.nutrientToggles.saturatedFat && (
                  <FormMacroField label="Sat. Fat" unit="g" value={activeVariant.macros.saturatedFat ?? 0} onChange={n => updateMacro('saturatedFat', n)} />
                )}
                {settings.nutrientToggles.transFat && (
                  <FormMacroField label="Trans Fat" unit="g" value={activeVariant.macros.transFat ?? 0} onChange={n => updateMacro('transFat', n)} />
                )}
                {settings.nutrientToggles.alcohol && (
                  <FormMacroField label="Alcohol" unit="g" value={activeVariant.macros.alcohol ?? 0} onChange={n => updateMacro('alcohol', n)} />
                )}
              </div>
            </Card>
          )}
        </section>
      </div>
    </Modal>
  )
}

// ─── Compact macro field with fraction support ────────────────────────────────
function FormMacroField({ label, unit, value, onChange }: {
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

// USDA API types
interface USDAFoodItem {
  fdcId: number
  description: string
  dataType: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients: { nutrientId: number; value: number }[]
}
