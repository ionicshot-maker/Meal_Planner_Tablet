import { useState } from 'react'
import type { MealSlotItem, MealItemRole, Recipe } from '@/types'
import { RecipePicker } from './RecipePicker'
import styles from './MealSlotSection.module.css'

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
}

const ROLE_LABELS: Record<MealItemRole, string> = {
  primary: 'Main',
  side: 'Side',
  dessert: 'Dessert',
}

interface Props {
  slotKey: string
  items: MealSlotItem[]
  recipes: Map<string, Recipe>
  allRecipes: Recipe[]
  onUpdateItems: (items: MealSlotItem[]) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, role: MealItemRole) => void
}

export function MealSlotSection({
  slotKey,
  items,
  recipes,
  allRecipes,
  onUpdateItems,
  onDragOver,
  onDrop,
}: Props) {
  const [addingRole, setAddingRole] = useState<MealItemRole | null>(null)
  const [dragover, setDragover] = useState(false)

  function addItem(recipe: Recipe, role: MealItemRole) {
    const newItem: MealSlotItem = {
      id: crypto.randomUUID(),
      role,
      recipeId: recipe.id,
      shared: true,
    }
    onUpdateItems([...items, newItem])
  }

  function addLeftover() {
    const newItem: MealSlotItem = {
      id: crypto.randomUUID(),
      role: 'side',
      isLeftover: true,
      manualLabel: 'Leftover',
      shared: true,
    }
    onUpdateItems([...items, newItem])
  }

  function removeItem(id: string) {
    onUpdateItems(items.filter(i => i.id !== id))
  }

  function toggleShared(id: string) {
    onUpdateItems(items.map(i => i.id === id ? { ...i, shared: !i.shared } : i))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragover(true)
    onDragOver(e)
  }

  function handleDragLeave() {
    setDragover(false)
  }

  function handleDrop(e: React.DragEvent) {
    setDragover(false)
    onDrop(e, items.length === 0 ? 'primary' : 'side')
  }

  const hasDesert = items.some(i => i.role === 'dessert')

  return (
    <div
      className={`${styles.section} ${dragover ? styles.dragover : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.sectionHeader}>
        <span className={styles.slotName}>{SLOT_LABELS[slotKey] ?? slotKey}</span>
        <div className={styles.addBtns}>
          <button className={styles.addBtn} onClick={() => setAddingRole('primary')}>
            + Main
          </button>
          <button className={styles.addBtn} onClick={() => setAddingRole('side')}>
            + Side
          </button>
          {!hasDesert && (
            <button className={styles.addBtn} onClick={() => setAddingRole('dessert')}>
              + Dessert
            </button>
          )}
          <button className={styles.addBtn} onClick={addLeftover}>
            + Leftover
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className={styles.itemList}>
          {items.map(item => {
            const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined
            const label = item.isLeftover
              ? (item.manualLabel ?? 'Leftover')
              : (recipe?.name ?? item.manualLabel ?? '—')
            const role = item.role ?? 'primary'

            return (
              <li key={item.id} className={styles.itemRow}>
                <span className={`${styles.roleBadge} ${styles[`role_${role}`]}`}>
                  {ROLE_LABELS[role]}
                </span>
                <span className={`${styles.itemName} ${item.isLeftover ? styles.leftoverName : ''}`}>
                  {label}
                  {item.isLeftover && <span className={styles.leftoverTag}> (leftover)</span>}
                </span>
                <button
                  className={`${styles.sharedBtn} ${item.shared ? styles.sharedActive : styles.individualActive}`}
                  onClick={() => toggleShared(item.id)}
                  title={item.shared ? 'Shared — click for individual' : 'Individual — click for shared'}
                >
                  {item.shared ? 'Shared' : 'Indiv.'}
                </button>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeItem(item.id)}
                  aria-label="Remove"
                >✕</button>
              </li>
            )
          })}
        </ul>
      )}

      {items.length === 0 && (
        <div className={styles.emptySlot}>
          Drop a recipe here or use the add buttons above
        </div>
      )}

      {addingRole && (
        <RecipePicker
          allRecipes={allRecipes}
          title={`Add ${ROLE_LABELS[addingRole]} — ${SLOT_LABELS[slotKey] ?? slotKey}`}
          onPick={r => { addItem(r, addingRole); setAddingRole(null) }}
          onClose={() => setAddingRole(null)}
        />
      )}
    </div>
  )
}
