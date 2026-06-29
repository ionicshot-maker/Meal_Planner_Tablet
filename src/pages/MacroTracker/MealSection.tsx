import type { MealSlotItem, MacroLogEntry, Recipe } from '@/types'
import { MacroItemRow } from './MacroItemRow'
import styles from './MealSection.module.css'

interface Props {
  slotLabel: string
  planItems: MealSlotItem[]
  entries: MacroLogEntry[]      // entries for this meal slot
  recipes: Map<string, Recipe>
  onPlanItemServings: (item: MealSlotItem, servings: number) => void
  onManualServings: (entry: MacroLogEntry, servings: number) => void
  onDeleteEntry: (id: string) => void
  onAddManual: () => void
}

export function MealSection({
  slotLabel, planItems, entries, recipes,
  onPlanItemServings, onManualServings, onDeleteEntry, onAddManual,
}: Props) {
  // Separate logged vs manual entries
  const planItemIds = new Set(planItems.map(i => i.id))
  const manualEntries = entries.filter(e => e.isManual || !e.mealSlotItemId || !planItemIds.has(e.mealSlotItemId))

  const loggedCount = [
    ...planItems.filter(item => entries.some(e => e.mealSlotItemId === item.id && e.servingsEaten > 0)),
    ...manualEntries,
  ].length
  const totalCount = planItems.length + manualEntries.length

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.slotLabel}>{slotLabel}</span>
        {totalCount > 0 && (
          <span className={styles.count}>{loggedCount}/{totalCount} logged</span>
        )}
      </div>

      {planItems.length === 0 && manualEntries.length === 0 ? (
        <div className={styles.empty}>No meals planned for this slot.</div>
      ) : (
        <div className={styles.items}>
          {planItems.map(item => {
            const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined
            const macros = item.isManual && item.manualMacros
              ? item.manualMacros
              : recipe?.macrosPerServing ?? null
            const existingEntry = entries.find(e => e.mealSlotItemId === item.id)
            const label = recipe?.name ?? item.manualLabel ?? 'Meal Item'
            const isLeftover = item.isLeftover === true
            return (
              <MacroItemRow
                key={item.id}
                label={label}
                isLeftover={isLeftover}
                macrosPerServing={macros}
                servings={existingEntry?.servingsEaten ?? 0}
                onServingsChange={svgs => onPlanItemServings(item, svgs)}
              />
            )
          })}
          {manualEntries.map(entry => (
            <MacroItemRow
              key={entry.id}
              label={entry.label ?? 'Manual Entry'}
              macrosPerServing={entry.macros}
              servings={entry.servingsEaten}
              onServingsChange={svgs => onManualServings(entry, svgs)}
              onDelete={() => onDeleteEntry(entry.id)}
            />
          ))}
        </div>
      )}

      <button className={styles.addBtn} onClick={onAddManual}>+ Add Item</button>
    </div>
  )
}
