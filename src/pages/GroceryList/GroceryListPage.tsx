import { useState, useEffect, useCallback } from 'react'
import {
  getActiveGroceryList, getGroceryHistory,
  saveGroceryList, archiveAndPrune,
} from '@/db/groceryLists'
import { getAllHouseholdItems } from '@/db/householdItems'
import { useSettings, useHouseholdTitle } from '@/context/SettingsContext'
import type { GroceryList, GroceryItem, HouseholdItem } from '@/types'
import { GroceryGenerator } from './GroceryGenerator'
import { GroceryListView } from './GroceryListView'
import { HouseholdModal } from './HouseholdModal'
import styles from './GroceryListPage.module.css'

export default function GroceryListPage() {
  const { settings } = useSettings()
  const pageTitle = useHouseholdTitle('Grocery List')
  const [activeList, setActiveList] = useState<GroceryList | null>(null)
  const [history, setHistory] = useState<GroceryList[]>([])
  const [householdItems, setHouseholdItems] = useState<HouseholdItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showHousehold, setShowHousehold] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [active, hist, household] = await Promise.all([
      getActiveGroceryList(),
      getGroceryHistory(),
      getAllHouseholdItems(),
    ])
    setActiveList(active ?? null)
    setHistory(hist)
    setHouseholdItems(household)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleGenerated(newList: GroceryList) {
    await archiveAndPrune()
    await saveGroceryList(newList)
    setShowGenerator(false)
    await load()
  }

  async function handleListUpdate(updated: GroceryList) {
    await saveGroceryList(updated)
    setActiveList(updated)
  }

  async function handleMarkComplete() {
    if (!activeList) return
    const completed = { ...activeList, status: 'completed' as const }
    await saveGroceryList(completed)
    await load()
  }

  function handleAddHouseholdToList(item: GroceryItem) {
    if (!activeList) return
    const updated = { ...activeList, manualItems: [...activeList.manualItems, item] }
    handleListUpdate(updated)
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return <div className={styles.page}><div className={styles.loading}>Loading…</div></div>
  }

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.pageTitle}>{pageTitle}</h1>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.householdBtn}
            onClick={() => setShowHousehold(true)}
            title="Household items"
          >
            🏠 Household
          </button>
          <button
            className={styles.generateBtn}
            onClick={() => setShowGenerator(true)}
          >
            {activeList ? '↺ New List' : '+ Generate List'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.content}>
        {!activeList ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🛒</div>
            <p className={styles.emptyTitle}>No active shopping list</p>
            <p className={styles.emptyDesc}>
              Generate a list from your meal plan to get started. The app will consolidate all
              ingredients from your planned meals into a single organized shopping list.
            </p>
            <button className={styles.generateBtnLarge} onClick={() => setShowGenerator(true)}>
              Generate Shopping List
            </button>
          </div>
        ) : (
          <GroceryListView
            list={activeList}
            showStoreOption={settings.storePreferenceEnabled}
            householdName={settings.householdName}
            onUpdate={handleListUpdate}
            onMarkComplete={handleMarkComplete}
          />
        )}

        {/* Shopping history */}
        {history.length > 0 && (
          <div className={styles.historySection}>
            <h2 className={styles.historyTitle}>Shopping History</h2>
            <div className={styles.historyList}>
              {history.map(list => {
                const isExpanded = expandedHistory === list.id
                const totalItems = list.items.length + list.manualItems.length
                const checkedItems = [...list.items, ...list.manualItems].filter(i => i.checked).length
                return (
                  <div key={list.id} className={styles.historyCard}>
                    <button
                      className={styles.historyCardHeader}
                      onClick={() => setExpandedHistory(isExpanded ? null : list.id)}
                    >
                      <div className={styles.historyMeta}>
                        <span className={styles.historyDate}>
                          {formatDate(list.startDate)} – {formatDate(list.endDate)}
                        </span>
                        <span className={styles.historyCount}>
                          {checkedItems}/{totalItems} items · generated {formatDate(list.generatedAt)}
                        </span>
                      </div>
                      <span className={styles.historyChevron}>{isExpanded ? '▾' : '▸'}</span>
                    </button>

                    {isExpanded && (
                      <div className={styles.historyDetail}>
                        {/* Read-only view: group by category */}
                        {Object.entries({
                          items: list.items,
                          manualItems: list.manualItems,
                          remainderItems: list.remainderItems,
                        }).map(([key, items]) => items.length > 0 && (
                          <div key={key} className={styles.historyGroup}>
                            <div className={styles.historyGroupLabel}>
                              {key === 'items' ? 'Recipe Items' : key === 'manualItems' ? 'Manual Items' : 'Remainder'}
                            </div>
                            <ul className={styles.historyItems}>
                              {(items as GroceryItem[]).map(item => (
                                <li
                                  key={item.id}
                                  className={`${styles.historyItem} ${item.checked ? styles.historyItemChecked : ''}`}
                                >
                                  <span className={styles.historyCheck}>{item.checked ? '✓' : '○'}</span>
                                  <span className={styles.historyItemName}>{item.name}</span>
                                  <span className={styles.historyItemQty}>{item.quantity} {item.unit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {showGenerator && (
        <GroceryGenerator
          onGenerated={handleGenerated}
          onClose={() => setShowGenerator(false)}
        />
      )}

      {showHousehold && (
        <HouseholdModal
          items={householdItems}
          hasActiveList={!!activeList}
          onItemsChange={setHouseholdItems}
          onAddToList={handleAddHouseholdToList}
          onClose={() => setShowHousehold(false)}
        />
      )}
    </div>
  )
}
