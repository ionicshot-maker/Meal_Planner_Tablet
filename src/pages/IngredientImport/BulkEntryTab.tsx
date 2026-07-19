import { useState } from 'react'
import { Button } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { saveIngredient, getAllIngredients } from '@/db/ingredients'
import { parseFraction } from '@/utils/fractionInput'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientUnit, NutriscoreGrade, NovaGroupNum } from '@/types'
import styles from './BulkEntryTab.module.css'

const UNITS: IngredientUnit[] = ['g', 'oz', 'ml', 'cup', 'tbsp', 'tsp', 'each', 'slice', 'piece']
const NUTRISCORE_OPTIONS = ['', 'A', 'B', 'C', 'D', 'E']
const NOVA_OPTIONS = ['', '1', '2', '3', '4']

function pf(s: string, fallback = 0): number {
  if (!s.trim()) return fallback
  // Treat leading-dot as 0.x
  const norm = /^\.\d/.test(s.trim()) ? '0' + s.trim() : s.trim()
  return parseFraction(norm) ?? fallback
}

interface BulkRow {
  id: string
  name: string
  category: string
  servingSize: string
  unit: IngredientUnit
  calories: string
  protein: string
  carbs: string
  fiber: string
  sugar: string
  fat: string
  sodium: string
  packageCost: string
  totalServings: string
  store: string
  barcode: string
  nutriscore: string
  nova: string
  allergens: string
  // ui state
  error: string
  saved: boolean
}

function blankRow(defaultCategory: string): BulkRow {
  return {
    id: newId(),
    name: '',
    category: defaultCategory,
    servingSize: '100',
    unit: 'g',
    calories: '',
    protein: '',
    carbs: '',
    fiber: '',
    sugar: '',
    fat: '',
    sodium: '',
    packageCost: '',
    totalServings: '',
    store: '',
    barcode: '',
    nutriscore: '',
    nova: '',
    allergens: '',
    error: '',
    saved: false,
  }
}

function parseAllergens(raw: string): string[] | undefined {
  const list = raw.split(',').map(a => a.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

function validateRow(row: BulkRow): string {
  if (!row.name.trim()) return 'Name is required'
  if (row.calories === '' || isNaN(+row.calories)) return 'Calories is required'
  return ''
}

interface Props {
  onSaved: (name: string) => void
}

export function BulkEntryTab({ onSaved }: Props) {
  const { settings } = useSettings()
  const defaultCategory = settings.ingredientCategories[0] ?? 'Pantry'
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, () => blankRow(defaultCategory)))
  const [saving, setSaving] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows(r => r.map(row => row.id === id ? { ...row, ...patch, error: '' } : row))
  }

  function addRow() {
    setRows(r => [...r, blankRow(defaultCategory)])
  }

  function removeRow(id: string) {
    setRows(r => r.filter(row => row.id !== id))
  }

  function clearAll() {
    setRows(Array.from({ length: 5 }, () => blankRow(defaultCategory)))
    setConfirmClear(false)
  }

  async function handleSaveAll() {
    // Validate
    const validated = rows.map(row => ({ ...row, error: validateRow(row) }))
    const hasErrors = validated.some(r => r.error)
    if (hasErrors) {
      setRows(validated)
      return
    }

    // Filter out already-saved rows
    const pending = validated.filter(r => !r.saved && r.name.trim())
    if (pending.length === 0) return

    setSaving(true)
    const existingIngredients = await getAllIngredients(true)
    const savedNames: string[] = []

    for (const row of pending) {
      const existing = existingIngredients.find(i =>
        i.name.toLowerCase() === row.name.trim().toLowerCase()
      )

      if (existing) {
        // Add as new variant
        const variantId = newId()
        const packageCost = pf(row.packageCost) || undefined
        const totalServings = pf(row.totalServings) || undefined
        const costPerServing = packageCost && totalServings
          ? packageCost / totalServings
          : undefined

        existing.variants.push({
          id: variantId,
          parentId: existing.id,
          brand: row.store || 'Generic',
          defaultUnit: row.unit,
          servingSize: pf(row.servingSize, 100),
          servingUnit: row.unit,
          macros: {
            calories: pf(row.calories),
            protein:  pf(row.protein),
            carbs:    pf(row.carbs),
            fiber:    pf(row.fiber),
            sugar:    pf(row.sugar),
            fat:      pf(row.fat),
            sodium:   pf(row.sodium),
          },
          packageCost,
          totalServingsInPackage: totalServings,
          costPerServing,
          store: row.store || undefined,
          barcode: row.barcode.trim() || undefined,
          nutriscore: (row.nutriscore || undefined) as NutriscoreGrade | undefined,
          novaGroup: (row.nova ? Number(row.nova) : undefined) as NovaGroupNum | undefined,
          allergens: parseAllergens(row.allergens),
        })
        existing.updatedAt = now()
        await saveIngredient(existing)
      } else {
        const variantId = newId()
        const ingredientId = newId()
        const packageCost = pf(row.packageCost) || undefined
        const totalServings = pf(row.totalServings) || undefined
        const variant = {
          id: variantId,
          parentId: ingredientId,
          brand: 'Generic',
          defaultUnit: row.unit,
          servingSize: pf(row.servingSize, 100),
          servingUnit: row.unit,
          macros: {
            calories: pf(row.calories),
            protein:  pf(row.protein),
            carbs:    pf(row.carbs),
            fiber:    pf(row.fiber),
            sugar:    pf(row.sugar),
            fat:      pf(row.fat),
            sodium:   pf(row.sodium),
          },
          packageCost,
          totalServingsInPackage: totalServings,
          costPerServing: packageCost && totalServings ? packageCost / totalServings : undefined,
          store: row.store || undefined,
          barcode: row.barcode.trim() || undefined,
          nutriscore: (row.nutriscore || undefined) as NutriscoreGrade | undefined,
          novaGroup: (row.nova ? Number(row.nova) : undefined) as NovaGroupNum | undefined,
          allergens: parseAllergens(row.allergens),
        }

        const ingredient: Ingredient = {
          id: ingredientId,
          name: row.name.trim(),
          category: row.category,
          perishable: false,
          frozen: false,
          alwaysOnHand: false,
          archived: false,
          createdAt: now(),
          updatedAt: now(),
          defaultVariantId: variantId,
          variants: [variant],
        }
        await saveIngredient(ingredient)
      }

      savedNames.push(row.name.trim())
      setRows(r => r.map(x => x.id === row.id ? { ...x, saved: true } : x))
      onSaved(row.name.trim())
    }

    setSaving(false)
  }

  const unsavedCount = rows.filter(r => !r.saved && r.name.trim()).length

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <span className={styles.desc}>{rows.length} rows · {unsavedCount} unsaved</span>
        <Button size="sm" variant="secondary" onClick={addRow}>+ Add Row</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>Clear All</Button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thName}>Name *</th>
              <th className={styles.thCat}>Category</th>
              <th className={styles.thNum}>Serving</th>
              <th className={styles.thUnit}>Unit</th>
              <th className={styles.thNum}>Cal *</th>
              <th className={styles.thNum}>Pro</th>
              <th className={styles.thNum}>Carb</th>
              <th className={styles.thNum}>Fiber</th>
              <th className={styles.thNum}>Sugar</th>
              <th className={styles.thNum}>Fat</th>
              <th className={styles.thNum}>Na mg</th>
              <th className={styles.thNum}>Pkg $</th>
              <th className={styles.thNum}>Svgs</th>
              <th className={styles.thStore}>Store</th>
              <th className={styles.thStore}>Barcode</th>
              <th className={styles.thUnit}>Nutriscore</th>
              <th className={styles.thUnit}>Nova</th>
              <th className={styles.thStore}>Allergens</th>
              <th className={styles.thDel}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.id}
                className={`${row.error ? styles.rowError : ''} ${row.saved ? styles.rowSaved : ''}`}
              >
                <td className={styles.tdName}>
                  <input
                    className={styles.cellInput}
                    value={row.name}
                    onChange={e => updateRow(row.id, { name: e.target.value })}
                    placeholder="Chicken Breast"
                    disabled={row.saved}
                  />
                  {row.error && <span className={styles.errorTip}>{row.error}</span>}
                </td>
                <td>
                  <select
                    className={styles.cellSelect}
                    value={row.category}
                    onChange={e => updateRow(row.id, { category: e.target.value })}
                    disabled={row.saved}
                  >
                    {settings.ingredientCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.servingSize} onChange={e => updateRow(row.id, { servingSize: e.target.value })} disabled={row.saved} /></td>
                <td>
                  <select className={styles.cellSelect} value={row.unit} onChange={e => updateRow(row.id, { unit: e.target.value as IngredientUnit })} disabled={row.saved}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td><input className={`${styles.cellNum} ${row.error && row.calories === '' ? styles.numError : ''}`} type="text" inputMode="decimal" value={row.calories} onChange={e => updateRow(row.id, { calories: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.protein} onChange={e => updateRow(row.id, { protein: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.carbs} onChange={e => updateRow(row.id, { carbs: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.fiber} onChange={e => updateRow(row.id, { fiber: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.sugar} onChange={e => updateRow(row.id, { sugar: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.fat} onChange={e => updateRow(row.id, { fat: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.sodium} onChange={e => updateRow(row.id, { sodium: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.packageCost} onChange={e => updateRow(row.id, { packageCost: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellNum} type="text" inputMode="decimal" value={row.totalServings} onChange={e => updateRow(row.id, { totalServings: e.target.value })} disabled={row.saved} /></td>
                <td><input className={styles.cellInput} value={row.store} onChange={e => updateRow(row.id, { store: e.target.value })} placeholder="Walmart" disabled={row.saved} /></td>
                <td><input className={styles.cellInput} value={row.barcode} onChange={e => updateRow(row.id, { barcode: e.target.value })} placeholder="UPC/EAN" disabled={row.saved} /></td>
                <td>
                  <select className={styles.cellSelect} value={row.nutriscore} onChange={e => updateRow(row.id, { nutriscore: e.target.value })} disabled={row.saved}>
                    {NUTRISCORE_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                </td>
                <td>
                  <select className={styles.cellSelect} value={row.nova} onChange={e => updateRow(row.id, { nova: e.target.value })} disabled={row.saved}>
                    {NOVA_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                </td>
                <td><input className={styles.cellInput} value={row.allergens} onChange={e => updateRow(row.id, { allergens: e.target.value })} placeholder="Gluten, Dairy" disabled={row.saved} /></td>
                <td>
                  {row.saved ? (
                    <span className={styles.savedMark} title="Saved">✓</span>
                  ) : (
                    <button className={styles.delBtn} onClick={() => removeRow(row.id)} title="Remove row">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <Button onClick={handleSaveAll} disabled={saving || unsavedCount === 0}>
          {saving ? 'Saving…' : `Save All (${unsavedCount})`}
        </Button>
      </div>

      {confirmClear && (
        <div className={styles.overlay}>
          <div className={styles.confirmBox}>
            <p>Clear all rows? This cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmClear(false)}>Cancel</button>
              <button className={styles.clearBtn} onClick={clearAll}>Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
