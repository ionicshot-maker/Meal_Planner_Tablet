import { useState } from 'react'
import { createPortal } from 'react-dom'
import { saveHouseholdItem, deleteHouseholdItem } from '@/db/householdItems'
import type { HouseholdItem, GroceryItem } from '@/types'
import styles from './HouseholdModal.module.css'

interface Props {
  items: HouseholdItem[]
  hasActiveList: boolean
  onItemsChange: (items: HouseholdItem[]) => void
  onAddToList: (item: GroceryItem) => void
  onClose: () => void
}

export function HouseholdModal({ items, hasActiveList, onItemsChange, onAddToList, onClose }: Props) {
  const [tab, setTab] = useState<'quick' | 'manage'>('quick')
  const [editingItem, setEditingItem] = useState<HouseholdItem | null>(null)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort()

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    const item: HouseholdItem = {
      id: crypto.randomUUID(),
      name,
      category: newCategory.trim() || 'Household',
      notes: newNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    await saveHouseholdItem(item)
    onItemsChange([...items, item].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
    setNewCategory('')
    setNewNotes('')
  }

  async function handleSaveEdit() {
    if (!editingItem) return
    await saveHouseholdItem(editingItem)
    onItemsChange(items.map(i => i.id === editingItem.id ? editingItem : i))
    setEditingItem(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this household item?')) return
    await deleteHouseholdItem(id)
    onItemsChange(items.filter(i => i.id !== id))
  }

  function handleAddToList(household: HouseholdItem) {
    const groceryItem: GroceryItem = {
      id: crypto.randomUUID(),
      name: household.name,
      quantity: 1,
      unit: 'each',
      category: household.category || 'Household',
      checked: false,
      partiallyBought: false,
      isManual: true,
    }
    onAddToList(groceryItem)
    setAddedIds(prev => new Set(prev).add(household.id))
  }

  const grouped = new Map<string, HouseholdItem[]>()
  for (const item of items) {
    const cat = item.category || 'Household'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(item)
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'quick' ? styles.tabActive : ''}`} onClick={() => setTab('quick')}>Quick Add</button>
            <button className={`${styles.tab} ${tab === 'manage' ? styles.tabActive : ''}`} onClick={() => setTab('manage')}>Manage Items</button>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {tab === 'quick' && (
            <>
              {!hasActiveList && (
                <div className={styles.notice}>Generate a shopping list first to add household items to it.</div>
              )}
              {items.length === 0 ? (
                <div className={styles.empty}>No household items yet. Add some in the Manage tab.</div>
              ) : (
                <div className={styles.chipGrid}>
                  {[...grouped.entries()].sort().map(([cat, catItems]) => (
                    <div key={cat} className={styles.chipGroup}>
                      <div className={styles.chipCat}>{cat}</div>
                      <div className={styles.chips}>
                        {catItems.map(item => (
                          <button
                            key={item.id}
                            className={`${styles.chip} ${addedIds.has(item.id) ? styles.chipAdded : ''}`}
                            onClick={() => hasActiveList && handleAddToList(item)}
                            disabled={!hasActiveList}
                            title={item.notes}
                          >
                            {addedIds.has(item.id) ? '✓ ' : '+ '}{item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'manage' && (
            <>
              {/* Add new */}
              <div className={styles.addForm}>
                <div className={styles.addRow}>
                  <input
                    className={styles.input}
                    placeholder="Item name (e.g. Dish soap)"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                  />
                  <input
                    className={`${styles.input} ${styles.inputSmall}`}
                    placeholder="Category"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    list="hh-cats"
                  />
                  <datalist id="hh-cats">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                  <button className={styles.addBtn} onClick={handleAdd} disabled={!newName.trim()}>Add</button>
                </div>
              </div>

              {/* Item list */}
              {items.length === 0 ? (
                <div className={styles.empty}>No household items yet.</div>
              ) : (
                <ul className={styles.manageList}>
                  {items.map(item => (
                    <li key={item.id} className={styles.manageRow}>
                      {editingItem?.id === item.id ? (
                        <div className={styles.editForm}>
                          <input
                            className={styles.input}
                            value={editingItem.name}
                            onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                          />
                          <input
                            className={`${styles.input} ${styles.inputSmall}`}
                            value={editingItem.category}
                            onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                            placeholder="Category"
                          />
                          <button className={styles.saveEditBtn} onClick={handleSaveEdit}>Save</button>
                          <button className={styles.cancelEditBtn} onClick={() => setEditingItem(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div className={styles.manageInfo}>
                            <span className={styles.manageName}>{item.name}</span>
                            <span className={styles.manageCat}>{item.category}</span>
                          </div>
                          <div className={styles.manageActions}>
                            <button className={styles.editBtn} onClick={() => setEditingItem({ ...item })}>Edit</button>
                            <button className={styles.deleteBtn} onClick={() => handleDelete(item.id)}>✕</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
