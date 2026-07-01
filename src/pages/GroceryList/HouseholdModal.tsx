import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { saveHouseholdItem, deleteHouseholdItem } from '@/db/householdItems'
import { BrandCombobox } from '@/components/BrandCombobox'
import { useSettings } from '@/context/SettingsContext'
import type { HouseholdItem, GroceryItem, IngredientUnit } from '@/types'
import styles from './HouseholdModal.module.css'

interface Props {
  items: HouseholdItem[]
  hasActiveList: boolean
  onItemsChange: (items: HouseholdItem[]) => void
  onAddToList: (item: GroceryItem) => void
  onClose: () => void
}

const BLANK = { name: '', category: 'Household', brand: '', store: '', price: '', notes: '', alwaysOnHand: false }

function makeGroceryItem(h: HouseholdItem): GroceryItem {
  return {
    id: crypto.randomUUID(),
    name: h.name,
    quantity: 1,
    unit: 'each' as IngredientUnit,
    category: h.category || 'Household',
    brand: h.brand || undefined,
    store: h.store || undefined,
    unitPrice: h.price,
    checked: false,
    partiallyBought: false,
    isManual: true,
  }
}

export function HouseholdModal({ items, hasActiveList, onItemsChange, onAddToList, onClose }: Props) {
  const { settings } = useSettings()
  const [tab, setTab] = useState<'quick' | 'manage'>('quick')
  const [form, setForm] = useState({ ...BLANK })
  const [editingItem, setEditingItem] = useState<HouseholdItem | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [aohPendingId, setAohPendingId] = useState<string | null>(null)

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort()

  function pf(patch: Partial<typeof BLANK>) { setForm(f => ({ ...f, ...patch })) }

  async function handleAdd() {
    const name = form.name.trim()
    if (!name) return
    const item: HouseholdItem = {
      id: crypto.randomUUID(),
      name,
      category: form.category.trim() || 'Household',
      brand: form.brand.trim() || undefined,
      store: form.store || undefined,
      price: form.price ? parseFloat(form.price) : undefined,
      notes: form.notes.trim() || undefined,
      alwaysOnHand: form.alwaysOnHand,
      createdAt: new Date().toISOString(),
    }
    await saveHouseholdItem(item)
    onItemsChange([...items, item].sort((a, b) => a.name.localeCompare(b.name)))
    setForm({ ...BLANK })
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

  function handleQuickAdd(item: HouseholdItem) {
    if (!hasActiveList) return
    if (item.alwaysOnHand) {
      setAohPendingId(item.id)
      return
    }
    onAddToList(makeGroceryItem(item))
    setAddedIds(prev => new Set(prev).add(item.id))
  }

  function handleAohConfirm(item: HouseholdItem) {
    onAddToList(makeGroceryItem(item))
    setAddedIds(prev => new Set(prev).add(item.id))
    setAohPendingId(null)
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
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className={styles.body}>
          {/* ── Quick Add ── */}
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
                        {catItems.map(item => {
                          const isAdded = addedIds.has(item.id)
                          const isPending = aohPendingId === item.id
                          const meta = [item.brand, item.notes].filter(Boolean).join(' · ')
                          return isPending ? (
                            <div key={item.id} className={styles.aohConfirm}>
                              <span className={styles.aohQuestion}>Need {item.name}?</span>
                              <button className={styles.aohYes} onClick={() => handleAohConfirm(item)}>Yes, add</button>
                              <button className={styles.aohNo} onClick={() => setAohPendingId(null)}>Skip</button>
                            </div>
                          ) : (
                            <button
                              key={item.id}
                              className={`${styles.chip} ${isAdded ? styles.chipAdded : ''} ${item.alwaysOnHand && !isAdded ? styles.chipAoh : ''}`}
                              onClick={() => hasActiveList && handleQuickAdd(item)}
                              disabled={!hasActiveList}
                              title={meta || undefined}
                            >
                              {isAdded ? '✓ ' : '+ '}{item.name}
                              {item.alwaysOnHand && !isAdded && <span className={styles.aohStar}>★</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Manage Items ── */}
          {tab === 'manage' && (
            <>
              <div className={styles.addForm}>
                <div className={styles.addRow}>
                  <input className={styles.input} placeholder="Item name *" value={form.name}
                    onChange={e => pf({ name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                  />
                  <input className={`${styles.input} ${styles.inputSm}`} placeholder="Category" value={form.category}
                    onChange={e => pf({ category: e.target.value })} list="hh-cats" />
                  <datalist id="hh-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className={styles.addRow}>
                  <div className={styles.brandWrap}>
                    <BrandCombobox value={form.brand} onChange={brand => pf({ brand })} label="" />
                  </div>
                  <select className={`${styles.input} ${styles.inputSm}`} value={form.store} onChange={e => pf({ store: e.target.value })}>
                    <option value="">Store…</option>
                    {settings.stores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className={`${styles.input} ${styles.inputPrice}`} type="number" placeholder="$ Price" min={0} step="0.01"
                    value={form.price} onChange={e => pf({ price: e.target.value })} />
                </div>
                <div className={styles.addRow}>
                  <input className={styles.input} placeholder="Notes (e.g. 80 count, Large, 30 gallon)" value={form.notes}
                    onChange={e => pf({ notes: e.target.value })} />
                  <label className={styles.aohLabel}>
                    <input type="checkbox" checked={form.alwaysOnHand} onChange={e => pf({ alwaysOnHand: e.target.checked })} />
                    Usually on hand
                  </label>
                  <button className={styles.addBtn} onClick={handleAdd} disabled={!form.name.trim()}>Add</button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className={styles.empty}>No household items yet.</div>
              ) : (
                <ul className={styles.manageList}>
                  {items.map(item => (
                    <li key={item.id} className={styles.manageRow}>
                      {editingItem?.id === item.id ? (
                        <EditForm
                          item={editingItem}
                          categories={categories}
                          stores={settings.stores}
                          onChange={setEditingItem}
                          onSave={handleSaveEdit}
                          onCancel={() => setEditingItem(null)}
                        />
                      ) : (
                        <>
                          <div className={styles.manageInfo}>
                            <span className={styles.manageName}>
                              {item.name}
                              {item.alwaysOnHand && <span className={styles.aohBadge}>on hand</span>}
                            </span>
                            <span className={styles.manageMeta}>
                              {[
                                item.category,
                                item.brand,
                                item.store ? `@ ${item.store}` : null,
                                item.price != null ? `$${item.price.toFixed(2)}` : null,
                                item.notes,
                              ].filter(Boolean).join(' · ')}
                            </span>
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

function EditForm({ item, categories, stores, onChange, onSave, onCancel }: {
  item: HouseholdItem
  categories: string[]
  stores: string[]
  onChange: (item: HouseholdItem) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className={styles.editForm}>
      <input className={styles.input} value={item.name} placeholder="Name *"
        onChange={e => onChange({ ...item, name: e.target.value })} />
      <input className={`${styles.input} ${styles.inputSm}`} value={item.category} placeholder="Category"
        onChange={e => onChange({ ...item, category: e.target.value })} list="hh-cats-edit" />
      <datalist id="hh-cats-edit">{categories.map(c => <option key={c} value={c} />)}</datalist>
      <div className={styles.brandWrap}>
        <BrandCombobox value={item.brand ?? ''} onChange={brand => onChange({ ...item, brand: brand || undefined })} label="" />
      </div>
      <select className={`${styles.input} ${styles.inputSm}`} value={item.store ?? ''}
        onChange={e => onChange({ ...item, store: e.target.value || undefined })}>
        <option value="">Store…</option>
        {stores.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className={`${styles.input} ${styles.inputPrice}`} type="number" placeholder="$ Price" min={0} step="0.01"
        value={item.price ?? ''}
        onChange={e => onChange({ ...item, price: e.target.value ? parseFloat(e.target.value) : undefined })} />
      <input className={styles.input} placeholder="Notes" value={item.notes ?? ''}
        onChange={e => onChange({ ...item, notes: e.target.value || undefined })} />
      <label className={styles.aohLabel}>
        <input type="checkbox" checked={item.alwaysOnHand ?? false}
          onChange={e => onChange({ ...item, alwaysOnHand: e.target.checked })} />
        On hand
      </label>
      <button className={styles.saveEditBtn} onClick={onSave}>Save</button>
      <button className={styles.cancelEditBtn} onClick={onCancel}>Cancel</button>
    </div>
  )
}
