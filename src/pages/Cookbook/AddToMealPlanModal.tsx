import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getMealPlanDay, saveMealPlanDay } from '@/db/mealPlan'
import { blankDayMeals, toISODate } from '@/utils/mealPlanUtils'
import type { MealItemRole, MealSlotItem } from '@/types'
import styles from './AddToMealPlanModal.module.css'

type MealSlotKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

interface Props {
  recipeId: string
  recipeName: string
  onClose: () => void
}

const SLOTS: { key: MealSlotKey; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
]

const ROLES: { key: MealItemRole; label: string }[] = [
  { key: 'primary', label: 'Main dish' },
  { key: 'side', label: 'Side dish' },
  { key: 'dessert', label: 'Dessert' },
]

export function AddToMealPlanModal({ recipeId, recipeName, onClose }: Props) {
  const [date, setDate] = useState(toISODate(new Date()))
  const [slot, setSlot] = useState<MealSlotKey>('dinner')
  const [role, setRole] = useState<MealItemRole>('primary')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleAdd() {
    setSaving(true)
    try {
      const existing = await getMealPlanDay(date)
      const meals = existing?.meals ?? blankDayMeals()
      const newItem: MealSlotItem = {
        id: crypto.randomUUID(),
        role,
        recipeId,
        shared: true,
      }
      const updatedMeals = { ...meals, [slot]: [...meals[slot], newItem] }
      await saveMealPlanDay({ date, meals: updatedMeals })
      setSaved(true)
      setTimeout(onClose, 900)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Add to Meal Plan</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.recipeName}>{recipeName}</div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date</span>
            <input
              type="date"
              className={styles.dateInput}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Meal</span>
            <div className={styles.pills}>
              {SLOTS.map(s => (
                <button
                  key={s.key}
                  className={`${styles.pill} ${slot === s.key ? styles.pillActive : ''}`}
                  onClick={() => setSlot(s.key)}
                >{s.label}</button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Role</span>
            <div className={styles.pills}>
              {ROLES.map(r => (
                <button
                  key={r.key}
                  className={`${styles.pill} ${role === r.key ? styles.pillActive : ''}`}
                  onClick={() => setRole(r.key)}
                >{r.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.addBtn} ${saved ? styles.addBtnSaved : ''}`}
            onClick={handleAdd}
            disabled={saving || saved || !date}
          >
            {saved ? '✓ Added!' : saving ? 'Adding…' : 'Add to Plan'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
