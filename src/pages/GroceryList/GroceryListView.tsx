import { useState, useRef } from 'react'
import type { GroceryList, GroceryItem } from '@/types'
import { groupByCategory, groupByStore, generatePrintHTML } from '@/utils/groceryUtils'
import { GroceryItemRow } from './GroceryItemRow'
import styles from './GroceryListView.module.css'

interface Props {
  list: GroceryList
  showStoreOption: boolean
  householdName: string
  onUpdate: (list: GroceryList) => void
  onMarkComplete: () => void
}

export function GroceryListView({ list, showStoreOption, householdName, onUpdate, onMarkComplete }: Props) {
  const [groupMode, setGroupMode] = useState<'category' | 'store'>('category')
  const [manualInput, setManualInput] = useState('')
  const [showRemainder, setShowRemainder] = useState(list.remainderItems.length > 0)
  const manualInputRef = useRef<HTMLInputElement>(null)

  const allItems = [...list.items, ...list.manualItems]
  const checkedCount = allItems.filter(i => i.checked).length
  const totalCount = allItems.length
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  const pricedItems = allItems.filter(i => i.unitPrice != null)
  const estimatedTotal = pricedItems.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.quantity, 0)

  function updateItem(id: string, patch: Partial<GroceryItem>, inManual = false) {
    const key = inManual ? 'manualItems' : 'items'
    const updated = {
      ...list,
      [key]: list[key].map(i => i.id === id ? { ...i, ...patch } : i),
    }
    onUpdate(updated)
  }

  function toggleCheck(id: string) {
    const inItems = list.items.find(i => i.id === id)
    if (inItems) {
      updateItem(id, { checked: !inItems.checked })
    } else {
      const inManual = list.manualItems.find(i => i.id === id)
      if (inManual) updateItem(id, { checked: !inManual.checked }, true)
    }
  }

  function handlePartialBuy(id: string, purchased: number, fromRemainder = false) {
    if (fromRemainder) {
      const item = list.remainderItems.find(i => i.id === id)
      if (!item) return
      const remainder = item.quantity - purchased
      const updatedRemainder = list.remainderItems.map(i =>
        i.id === id ? { ...i, partiallyBought: true, purchasedQuantity: purchased, checked: true } : i
      )
      if (remainder > 0.001) {
        updatedRemainder.push({
          ...item,
          id: crypto.randomUUID(),
          quantity: Math.round(remainder * 100) / 100,
          partiallyBought: false,
          purchasedQuantity: undefined,
          checked: false,
        })
      }
      onUpdate({ ...list, remainderItems: updatedRemainder })
      return
    }

    const item = list.items.find(i => i.id === id) ?? list.manualItems.find(i => i.id === id)
    if (!item) return
    const remainder = item.quantity - purchased
    const isManual = list.manualItems.some(i => i.id === id)

    const patchedList = {
      ...list,
      items: isManual ? list.items : list.items.map(i =>
        i.id === id ? { ...i, partiallyBought: true, purchasedQuantity: purchased, checked: true } : i
      ),
      manualItems: isManual ? list.manualItems.map(i =>
        i.id === id ? { ...i, partiallyBought: true, purchasedQuantity: purchased, checked: true } : i
      ) : list.manualItems,
    }

    if (remainder > 0.001) {
      patchedList.remainderItems = [
        ...list.remainderItems,
        {
          ...item,
          id: crypto.randomUUID(),
          quantity: Math.round(remainder * 100) / 100,
          partiallyBought: false,
          purchasedQuantity: undefined,
          checked: false,
        },
      ]
      setShowRemainder(true)
    }
    onUpdate(patchedList)
  }

  function toggleRemainderCheck(id: string) {
    onUpdate({
      ...list,
      remainderItems: list.remainderItems.map(i =>
        i.id === id ? { ...i, checked: !i.checked } : i
      ),
    })
  }

  function addManualItem() {
    const name = manualInput.trim()
    if (!name) return
    const newItem: GroceryItem = {
      id: crypto.randomUUID(),
      name,
      quantity: 1,
      unit: 'each',
      category: 'Manual',
      checked: false,
      partiallyBought: false,
      isManual: true,
    }
    onUpdate({ ...list, manualItems: [...list.manualItems, newItem] })
    setManualInput('')
    manualInputRef.current?.focus()
  }

  function removeManualItem(id: string) {
    onUpdate({ ...list, manualItems: list.manualItems.filter(i => i.id !== id) })
  }

  function handlePrint() {
    const grouped = groupMode === 'store'
      ? groupByStore(list.items)
      : groupByCategory(list.items)
    const html = generatePrintHTML(list, grouped, householdName)
    const w = window.open('', '_blank', 'width=800,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }

  const grouped = groupMode === 'store'
    ? groupByStore(list.items)
    : groupByCategory(list.items)

  const dateRange = `${list.startDate} – ${list.endDate}`

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Shopping List</h2>
          <span className={styles.dateRange}>{dateRange}</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.printBtn} onClick={handlePrint} title="Print / Save as PDF">
            🖨 Print / PDF
          </button>
          <button className={styles.completeBtn} onClick={onMarkComplete}>
            Mark Complete
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        <span className={styles.progressLabel}>
          {checkedCount} of {totalCount} items checked
        </span>
      </div>

      {/* Group mode toggle */}
      {showStoreOption && (
        <div className={styles.groupToggle}>
          <button
            className={`${styles.groupBtn} ${groupMode === 'category' ? styles.groupBtnActive : ''}`}
            onClick={() => setGroupMode('category')}
          >By Category</button>
          <button
            className={`${styles.groupBtn} ${groupMode === 'store' ? styles.groupBtnActive : ''}`}
            onClick={() => setGroupMode('store')}
          >By Store</button>
        </div>
      )}

      {/* Main list */}
      <div className={styles.listArea}>
        {grouped.length === 0 && (
          <div className={styles.emptyList}>
            No items on this list. Add manual items below or re-generate.
          </div>
        )}
        {grouped.map(([group, items]) => (
          <div key={group} className={styles.categorySection}>
            <div className={styles.categoryHeader}>{group}</div>
            <ul className={styles.itemList}>
              {items.map(item => (
                <GroceryItemRow
                  key={item.id}
                  item={item}
                  showStore={groupMode === 'category' && showStoreOption}
                  onToggleCheck={toggleCheck}
                  onPartialBuy={(id, qty) => handlePartialBuy(id, qty)}
                />
              ))}
            </ul>
          </div>
        ))}

        {/* Remainder section */}
        {list.remainderItems.length > 0 && (
          <div className={styles.remainderSection}>
            <button
              className={styles.sectionToggle}
              onClick={() => setShowRemainder(r => !r)}
            >
              {showRemainder ? '▾' : '▸'} Remainder Items ({list.remainderItems.length})
            </button>
            {showRemainder && (
              <ul className={styles.itemList}>
                {list.remainderItems.map(item => (
                  <GroceryItemRow
                    key={item.id}
                    item={item}
                    showStore={false}
                    onToggleCheck={() => toggleRemainderCheck(item.id)}
                    onPartialBuy={(id, qty) => handlePartialBuy(id, qty, true)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Manual items section */}
        <div className={styles.manualSection}>
          <div className={styles.categoryHeader}>Other / Manual Items</div>
          {list.manualItems.length > 0 && (
            <ul className={styles.itemList}>
              {list.manualItems.map(item => (
                <GroceryItemRow
                  key={item.id}
                  item={item}
                  showStore={false}
                  onToggleCheck={toggleCheck}
                  onPartialBuy={(id, qty) => handlePartialBuy(id, qty)}
                  onRemove={item.isManual ? removeManualItem : undefined}
                />
              ))}
            </ul>
          )}
          <div className={styles.addManual}>
            <input
              ref={manualInputRef}
              className={styles.manualInput}
              placeholder="Add an item manually…"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addManualItem() }}
            />
            <button
              className={styles.manualAddBtn}
              onClick={addManualItem}
              disabled={!manualInput.trim()}
            >Add</button>
          </div>
        </div>
      </div>

      {pricedItems.length > 0 && (
        <div className={styles.totalBar}>
          <span className={styles.totalLabel}>
            Estimated total ({pricedItems.length} priced item{pricedItems.length !== 1 ? 's' : ''})
          </span>
          <span className={styles.totalAmount}>${estimatedTotal.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}
