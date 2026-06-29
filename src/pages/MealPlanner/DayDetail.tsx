import { useState } from 'react'
import type { MealPlanDay, MealSlotItem, MealItemRole, Recipe } from '@/types'
import { parseDateLocal, blankDayMeals } from '@/utils/mealPlanUtils'
import { formatMinutes } from '@/utils/units'
import { MealSlotSection } from './MealSlotSection'
import styles from './DayDetail.module.css'

interface Props {
  date: string
  day: MealPlanDay
  recipes: Map<string, Recipe>
  allRecipes: Recipe[]
  onUpdate: (day: MealPlanDay) => void
  onClose: () => void
}

const SLOT_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
type SlotKey = typeof SLOT_KEYS[number]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function DayDetail({ date, day, recipes, allRecipes, onUpdate, onClose }: Props) {
  const [showSnacks, setShowSnacks] = useState(day.meals.snacks.length > 0)
  const [draggingRecipeId, setDraggingRecipeId] = useState<string | null>(null)

  const d = parseDateLocal(date)
  const title = `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`

  const meals = day.meals ?? blankDayMeals()

  function updateSlot(slotKey: SlotKey, items: MealSlotItem[]) {
    const updated: MealPlanDay = {
      ...day,
      meals: { ...meals, [slotKey]: items },
    }
    onUpdate(updated)
  }

  function clearDay() {
    if (!confirm('Clear all meals for this day?')) return
    onUpdate({ date, meals: blankDayMeals() })
  }

  // Total time for the day (unique recipes only)
  const counted = new Set<string>()
  let totalMins = 0
  for (const slot of Object.values(meals)) {
    for (const item of slot as MealSlotItem[]) {
      if (item.recipeId && !counted.has(item.recipeId)) {
        counted.add(item.recipeId)
        const r = recipes.get(item.recipeId)
        if (r) totalMins += r.prepTimeMinutes + r.cookTimeMinutes
      }
    }
  }

  // Drag from recipe strip
  function handleStripDragStart(e: React.DragEvent, recipeId: string) {
    e.dataTransfer.setData('text/plain', recipeId)
    setDraggingRecipeId(recipeId)
  }

  function handleSlotDrop(e: React.DragEvent, slotKey: SlotKey, role: MealItemRole) {
    e.preventDefault()
    const recipeId = e.dataTransfer.getData('text/plain')
    if (!recipeId) return
    const recipe = recipes.get(recipeId)
    if (!recipe) return
    const existing = meals[slotKey]
    const newItem: MealSlotItem = {
      id: crypto.randomUUID(),
      role,
      recipeId,
      shared: true,
    }
    updateSlot(slotKey, [...existing, newItem])
    setDraggingRecipeId(null)
  }

  // Compact recipe strip (top 20 by name)
  const recipeStrip = allRecipes
    .filter(r => !r.isTemplate)
    .slice(0, 20)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>{title}</h2>
          {totalMins > 0 && (
            <span className={styles.totalTime}>⏱ {formatMinutes(totalMins)} total</span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button className={styles.clearBtn} onClick={clearDay} title="Clear day">Clear</button>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Recipe drag strip */}
      {recipeStrip.length > 0 && (
        <div className={styles.recipeStrip}>
          <span className={styles.stripLabel}>Drag to slot:</span>
          <div className={styles.stripList}>
            {recipeStrip.map(r => (
              <div
                key={r.id}
                className={`${styles.stripItem} ${draggingRecipeId === r.id ? styles.dragging : ''}`}
                draggable
                onDragStart={e => handleStripDragStart(e, r.id)}
                onDragEnd={() => setDraggingRecipeId(null)}
                title={r.name}
              >
                {r.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meal slots */}
      <div className={styles.slots}>
        {(['breakfast', 'lunch', 'dinner'] as SlotKey[]).map(slotKey => (
          <MealSlotSection
            key={slotKey}
            slotKey={slotKey}
            items={meals[slotKey]}
            recipes={recipes}
            allRecipes={allRecipes}
            onUpdateItems={items => updateSlot(slotKey, items)}
            onDragOver={e => e.preventDefault()}
            onDrop={(e, role) => handleSlotDrop(e, slotKey, role)}
          />
        ))}

        {showSnacks ? (
          <MealSlotSection
            slotKey="snacks"
            items={meals.snacks}
            recipes={recipes}
            allRecipes={allRecipes}
            onUpdateItems={items => updateSlot('snacks', items)}
            onDragOver={e => e.preventDefault()}
            onDrop={(e, role) => handleSlotDrop(e, 'snacks', role)}
          />
        ) : (
          <button className={styles.addSnacksBtn} onClick={() => setShowSnacks(true)}>
            + Add Snacks
          </button>
        )}
      </div>
    </div>
  )
}
