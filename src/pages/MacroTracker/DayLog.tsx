import { useState, useEffect } from 'react'
import { getMealPlanDay } from '@/db/mealPlan'
import { getAllRecipes } from '@/db/recipes'
import { getEntriesForDay, saveEntry, deleteEntry } from '@/db/macroLogs'
import { ZERO_MACROS } from '@/utils/macroUtils'
import type { Person, MealPlanDay, MealSlotItem, MacroLogEntry, Macros, NutrientToggles, UnitSystem, Recipe, DayMeals } from '@/types'
import { MealSection } from './MealSection'
import { DailyTotals } from './DailyTotals'
import { ManualLogModal } from './ManualLogModal'
import { GoalSetupModal } from './GoalSetupModal'
import styles from './DayLog.module.css'

interface Props {
  person: Person
  date: string
  nutrientToggles: NutrientToggles
  unitSystem: UnitSystem
  householdSize: number
}

const MEAL_SLOTS: { key: keyof DayMeals; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'dinner',    label: 'Dinner' },
  { key: 'snacks',    label: 'Snacks' },
  { key: 'drinks',    label: 'Drinks' },
]

export function DayLog({ person, date, nutrientToggles, unitSystem }: Props) {
  const [planDay, setPlanDay]   = useState<MealPlanDay | null>(null)
  const [recipes, setRecipes]   = useState<Map<string, Recipe>>(new Map())
  const [entries, setEntries]   = useState<MacroLogEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [waterInput, setWaterInput]   = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [showManual, setShowManual]   = useState(false)
  const [manualSlot, setManualSlot]   = useState('breakfast')
  const [showGoals, setShowGoals]     = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [day, allRecipes, dayEntries] = await Promise.all([
        getMealPlanDay(date),
        getAllRecipes(false),
        getEntriesForDay(date, person.id),
      ])
      if (cancelled) return
      setPlanDay(day ?? null)
      setRecipes(new Map(allRecipes.map(r => [r.id, r])))
      setEntries(dayEntries)
      const we = dayEntries.find(e => e.mealSlot === '__water__')
      const wt = dayEntries.find(e => e.mealSlot === '__weight__')
      setWaterInput(we?.waterOz?.toString() ?? '')
      setWeightInput(wt?.weightLbs?.toString() ?? '')
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [date, person.id])

  async function upsertEntry(entry: MacroLogEntry) {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      return idx >= 0 ? prev.map(e => e.id === entry.id ? entry : e) : [...prev, entry]
    })
    await saveEntry(entry)
  }

  async function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
    await deleteEntry(id)
  }

  async function handlePlanItemServings(item: MealSlotItem, slot: string, servings: number) {
    const existing = entries.find(e => e.mealSlotItemId === item.id && e.mealSlot === slot)
    if (servings <= 0) {
      if (existing) await removeEntry(existing.id)
      return
    }
    const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined
    const macros: Macros = (item.isManual && item.manualMacros)
      ? item.manualMacros
      : recipe?.macrosPerServing ?? { ...ZERO_MACROS }

    await upsertEntry({
      id: existing?.id ?? crypto.randomUUID(),
      date,
      personId: person.id,
      mealSlot: slot,
      mealSlotItemId: item.id,
      label: recipe?.name ?? item.manualLabel ?? 'Item',
      recipeId: item.recipeId,
      servingsEaten: servings,
      macros,
      isManual: false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    })
  }

  async function handleManualServings(entry: MacroLogEntry, servings: number) {
    if (servings <= 0) { await removeEntry(entry.id); return }
    await upsertEntry({ ...entry, servingsEaten: servings })
  }

  async function handleAddManual(partial: Omit<MacroLogEntry, 'id' | 'createdAt'>) {
    await upsertEntry({ ...partial, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
  }

  async function handleWaterSave() {
    const oz = parseFloat(waterInput) || 0
    const existing = entries.find(e => e.mealSlot === '__water__')
    if (oz <= 0) {
      if (existing) await removeEntry(existing.id)
      return
    }
    await upsertEntry({
      id: existing?.id ?? crypto.randomUUID(),
      date, personId: person.id,
      mealSlot: '__water__', label: 'Water',
      servingsEaten: 0, macros: { ...ZERO_MACROS },
      waterOz: oz, isManual: false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    })
  }

  async function handleWeightSave() {
    const lbs = parseFloat(weightInput) || 0
    const existing = entries.find(e => e.mealSlot === '__weight__')
    if (lbs <= 0) {
      if (existing) await removeEntry(existing.id)
      return
    }
    await upsertEntry({
      id: existing?.id ?? crypto.randomUUID(),
      date, personId: person.id,
      mealSlot: '__weight__', label: 'Weight',
      servingsEaten: 0, macros: { ...ZERO_MACROS },
      weightLbs: lbs, isManual: false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    })
  }

  if (loading) {
    return <div className={styles.loading}>Loading…</div>
  }

  return (
    <div className={styles.dayLog}>
      {MEAL_SLOTS.map(({ key, label }) => {
        const planItems = planDay?.meals[key] ?? []
        const slotEntries = entries.filter(e => e.mealSlot === key)
        return (
          <MealSection
            key={key}
            slotLabel={label}
            planItems={planItems}
            entries={slotEntries}
            recipes={recipes}
            onPlanItemServings={(item, svgs) => handlePlanItemServings(item, key, svgs)}
            onManualServings={handleManualServings}
            onDeleteEntry={removeEntry}
            onAddManual={() => { setManualSlot(key); setShowManual(true) }}
          />
        )
      })}

      {/* Water tracking */}
      {person.trackWater && (
        <div className={styles.metaSection}>
          <span className={styles.metaLabel}>💧 Water Intake</span>
          <div className={styles.metaInputRow}>
            <input
              type="number" min={0} max={600} step={1}
              className={styles.metaInput}
              placeholder="0"
              value={waterInput}
              onChange={e => setWaterInput(e.target.value)}
              onBlur={handleWaterSave}
            />
            <span className={styles.metaUnit}>{unitSystem === 'metric' ? 'ml' : 'oz'}</span>
          </div>
        </div>
      )}

      {/* Weight tracking (complex mode) */}
      {person.mode === 'complex' && person.trackWeight && (
        <div className={styles.metaSection}>
          <span className={styles.metaLabel}>⚖️ Weight</span>
          <div className={styles.metaInputRow}>
            <input
              type="number" min={0} step={0.1}
              className={styles.metaInput}
              placeholder="0"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onBlur={handleWeightSave}
            />
            <span className={styles.metaUnit}>{unitSystem === 'metric' ? 'kg' : 'lbs'}</span>
          </div>
        </div>
      )}

      <DailyTotals
        entries={entries}
        person={person}
        nutrientToggles={nutrientToggles}
        date={date}
        onSetGoals={() => setShowGoals(true)}
      />

      {showManual && (
        <ManualLogModal
          initialSlot={manualSlot}
          date={date}
          personId={person.id}
          nutrientToggles={nutrientToggles}
          onAdd={handleAddManual}
          onClose={() => setShowManual(false)}
        />
      )}

      {showGoals && person.mode === 'complex' && (
        <GoalSetupModal
          personId={person.id}
          nutrientToggles={nutrientToggles}
          onClose={() => setShowGoals(false)}
        />
      )}
    </div>
  )
}
