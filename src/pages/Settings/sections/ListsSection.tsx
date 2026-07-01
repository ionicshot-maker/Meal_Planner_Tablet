import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import { DEFAULT_SETTINGS } from '@/db/settings'
import styles from './ListsSection.module.css'

function editDistance(a: string, b: string): number {
  const la = a.toLowerCase(), lb = b.toLowerCase()
  const m = la.length, n = lb.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = la[i - 1] === lb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

interface ListCardProps {
  title: string
  items: string[]
  defaultItems?: string[]
  onAdd: (item: string) => void
  onRemove: (item: string) => void
  onRemoveSection?: () => void
}

function ListCard({ title, items, defaultItems, onAdd, onRemove, onRemoveSection }: ListCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [removeQuery, setRemoveQuery] = useState('')
  const [showRemoveDropdown, setShowRemoveDropdown] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmRemoveSection, setConfirmRemoveSection] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewSearch, setViewSearch] = useState('')
  const addRef = useRef<HTMLDivElement>(null)
  const removeRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => [...items].sort((a, b) => a.localeCompare(b)), [items])

  const trimmed = addInput.trim()
  const isDuplicate = items.some(i => i.toLowerCase() === trimmed.toLowerCase())

  const similarItems = useMemo(() => {
    if (!trimmed || isDuplicate) return []
    return items.filter(i => {
      const d = editDistance(i, trimmed)
      return d > 0 && d <= 2
    })
  }, [trimmed, items, isDuplicate])

  const suggestions = useMemo(() => {
    if (!trimmed) return []
    return sorted.filter(i => i.toLowerCase().includes(trimmed.toLowerCase()) && i.toLowerCase() !== trimmed.toLowerCase())
  }, [trimmed, sorted])

  const removeFiltered = useMemo(() => {
    if (!removeQuery.trim()) return sorted
    return sorted.filter(i => i.toLowerCase().includes(removeQuery.toLowerCase()))
  }, [removeQuery, sorted])

  const viewFiltered = useMemo(() => {
    if (!viewSearch.trim()) return sorted
    return sorted.filter(i => i.toLowerCase().includes(viewSearch.toLowerCase()))
  }, [viewSearch, sorted])

  const missingDefaults = useMemo(() => {
    if (!defaultItems) return []
    return defaultItems.filter(d => !items.some(i => i.toLowerCase() === d.toLowerCase()))
  }, [defaultItems, items])

  function handleAdd() {
    if (!trimmed || isDuplicate) return
    onAdd(trimmed)
    setAddInput('')
    setShowSuggestions(false)
  }

  function handleRestoreDefaults() {
    missingDefaults.forEach(d => onAdd(d))
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setShowSuggestions(false)
      if (removeRef.current && !removeRef.current.contains(e.target as Node)) setShowRemoveDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className={styles.listCard}>
      <button
        className={styles.listCardHeader}
        onClick={() => setExpanded(v => !v)}
        type="button"
      >
        <span className={styles.listCardTitle}>{title}</span>
        <span className={styles.listCardCount}>{items.length} items</span>
        <span className={`${styles.listCardArrow} ${expanded ? styles.listCardArrowOpen : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className={styles.listCardBody}>
          <div className={styles.fieldLabel}>Add</div>
          <div className={styles.comboWrap} ref={addRef}>
            <div className={styles.addRow}>
              <input
                className={styles.comboInput}
                placeholder="Type to add…"
                value={addInput}
                onChange={e => { setAddInput(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              />
              <button
                className={styles.addBtn}
                onClick={handleAdd}
                disabled={!trimmed || isDuplicate}
                type="button"
              >Add</button>
            </div>
            {isDuplicate && trimmed && (
              <p className={styles.warnDuplicate}>"{trimmed}" already exists in this list.</p>
            )}
            {!isDuplicate && similarItems.length > 0 && (
              <p className={styles.warnSimilar}>Similar existing: {similarItems.slice(0, 3).join(', ')}</p>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className={styles.comboDropdown}>
                {suggestions.slice(0, 8).map(s => (
                  <button
                    key={s}
                    className={styles.comboOption}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setAddInput(s); setShowSuggestions(false) }}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.fieldLabel} style={{ marginTop: 'var(--space-3)' }}>Remove</div>
          <div className={styles.comboWrap} ref={removeRef}>
            <input
              className={styles.comboInput}
              placeholder="Search to remove…"
              value={removeQuery}
              onChange={e => { setRemoveQuery(e.target.value); setShowRemoveDropdown(true) }}
              onFocus={() => setShowRemoveDropdown(true)}
            />
            {showRemoveDropdown && (
              <div className={styles.comboDropdown}>
                {removeFiltered.length === 0
                  ? <div className={styles.comboEmpty}>No matches</div>
                  : removeFiltered.slice(0, 10).map(s => (
                    <button
                      key={s}
                      className={styles.comboOption}
                      type="button"
                      onClick={() => {
                        setConfirmRemove(s)
                        setRemoveQuery('')
                        setShowRemoveDropdown(false)
                      }}
                    >{s}</button>
                  ))
                }
              </div>
            )}
          </div>

          <div className={styles.cardActions}>
            <button
              className={styles.viewBtn}
              type="button"
              onClick={() => { setViewOpen(true); setViewSearch('') }}
            >View all {items.length}</button>
            {missingDefaults.length > 0 && (
              <button
                className={styles.restoreDefaultsBtn}
                type="button"
                onClick={handleRestoreDefaults}
              >Restore {missingDefaults.length} default{missingDefaults.length !== 1 ? 's' : ''}</button>
            )}
            {onRemoveSection && (
              <button
                className={styles.removeSectionBtn}
                type="button"
                onClick={() => setConfirmRemoveSection(true)}
              >Remove group</button>
            )}
          </div>
        </div>
      )}

      {/* Confirm remove item */}
      {confirmRemove !== null && createPortal(
        <div
          className={styles.overlay}
          onClick={e => { if (e.target === e.currentTarget) setConfirmRemove(null) }}
        >
          <div className={styles.dialog}>
            <p className={styles.dialogMsg}>
              Are you sure you want to remove <strong>"{confirmRemove}"</strong>? This cannot be undone.
            </p>
            <div className={styles.dialogBtns}>
              <button className={styles.dialogCancel} type="button" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button
                className={styles.dialogConfirm}
                type="button"
                onClick={() => { onRemove(confirmRemove); setConfirmRemove(null) }}
              >Remove</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm remove section/group */}
      {confirmRemoveSection && createPortal(
        <div
          className={styles.overlay}
          onClick={e => { if (e.target === e.currentTarget) setConfirmRemoveSection(false) }}
        >
          <div className={styles.dialog}>
            <p className={styles.dialogMsg}>
              Are you sure you want to remove the <strong>"{title}"</strong> group and all its tags? This cannot be undone.
            </p>
            <div className={styles.dialogBtns}>
              <button className={styles.dialogCancel} type="button" onClick={() => setConfirmRemoveSection(false)}>Cancel</button>
              <button
                className={styles.dialogConfirm}
                type="button"
                onClick={() => { onRemoveSection?.(); setConfirmRemoveSection(false) }}
              >Remove</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View all modal */}
      {viewOpen && createPortal(
        <div
          className={styles.overlay}
          onClick={e => { if (e.target === e.currentTarget) setViewOpen(false) }}
        >
          <div className={styles.viewModal}>
            <div className={styles.viewModalHeader}>
              <span className={styles.viewModalTitle}>{title} — {items.length} items</span>
              <button className={styles.viewModalClose} type="button" onClick={() => setViewOpen(false)}>✕</button>
            </div>
            <input
              className={styles.viewSearch}
              placeholder="Search…"
              value={viewSearch}
              onChange={e => setViewSearch(e.target.value)}
              autoFocus
            />
            <div className={styles.viewGrid}>
              {viewFiltered.map(item => (
                <div key={item} className={styles.viewItem}>
                  <span className={styles.viewItemLabel}>{item}</span>
                  <button
                    className={styles.viewItemRemove}
                    type="button"
                    onClick={() => onRemove(item)}
                    aria-label={`Remove ${item}`}
                  >✕</button>
                </div>
              ))}
              {viewFiltered.length === 0 && <p className={styles.viewEmpty}>No matches</p>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export function ListsSection() {
  const { settings, updateSettings } = useSettings()
  const { ingredientCategories, recipeTags, brands, stores } = settings
  const [newGroupName, setNewGroupName] = useState('')

  function addCategory(item: string) {
    updateSettings({ ingredientCategories: [...ingredientCategories, item] })
  }
  function removeCategory(item: string) {
    updateSettings({ ingredientCategories: ingredientCategories.filter(c => c !== item) })
  }

  function addBrand(item: string) {
    updateSettings({ brands: [...(brands ?? []), item] })
  }
  function removeBrand(item: string) {
    updateSettings({ brands: (brands ?? []).filter(b => b !== item) })
  }

  function addStore(item: string) {
    updateSettings({ stores: [...(stores ?? []), item] })
  }
  function removeStore(item: string) {
    updateSettings({ stores: (stores ?? []).filter(s => s !== item) })
  }

  function addTagToGroup(group: string, tag: string) {
    const updated = recipeTags.map(g =>
      g.group === group && !g.tags.includes(tag)
        ? { ...g, tags: [...g.tags, tag] }
        : g
    )
    updateSettings({ recipeTags: updated })
  }

  function removeTagFromGroup(group: string, tag: string) {
    const updated = recipeTags.map(g =>
      g.group === group ? { ...g, tags: g.tags.filter(t => t !== tag) } : g
    )
    updateSettings({ recipeTags: updated })
  }

  function removeTagGroup(group: string) {
    updateSettings({ recipeTags: recipeTags.filter(g => g.group !== group) })
  }

  function addTagGroup() {
    const trimmed = newGroupName.trim()
    if (!trimmed || recipeTags.some(g => g.group === trimmed)) return
    updateSettings({ recipeTags: [...recipeTags, { group: trimmed, tags: [] }] })
    setNewGroupName('')
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Lists Management</h2>

      <h3 className={styles.subTitle}>Ingredient Categories</h3>
      <ListCard
        title="Ingredient Categories"
        items={ingredientCategories}
        defaultItems={DEFAULT_SETTINGS.ingredientCategories}
        onAdd={addCategory}
        onRemove={removeCategory}
      />

      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Recipe Tags</h3>
      <p className={styles.desc}>Tags are organized by group. Multiple tags can be applied per recipe.</p>
      {recipeTags.map(group => {
        const defaultGroup = DEFAULT_SETTINGS.recipeTags.find(g => g.group === group.group)
        return (
          <ListCard
            key={group.group}
            title={group.group}
            items={group.tags}
            defaultItems={defaultGroup?.tags}
            onAdd={tag => addTagToGroup(group.group, tag)}
            onRemove={tag => removeTagFromGroup(group.group, tag)}
            onRemoveSection={() => removeTagGroup(group.group)}
          />
        )
      })}
      <div className={styles.addGroupRow}>
        <input
          className={styles.addGroupInput}
          placeholder="New tag group name…"
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTagGroup() } }}
        />
        <button
          className={styles.addGroupBtn}
          type="button"
          onClick={addTagGroup}
          disabled={!newGroupName.trim()}
        >+ Add Group</button>
      </div>

      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Brands</h3>
      <p className={styles.desc}>Used in the ingredient editor. New brands added while editing ingredients appear here automatically.</p>
      <ListCard
        title="Brands"
        items={brands ?? []}
        onAdd={addBrand}
        onRemove={removeBrand}
      />

      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Stores</h3>
      <p className={styles.desc}>Assign preferred purchase locations to ingredient variants.</p>
      <ListCard
        title="Stores"
        items={stores ?? []}
        defaultItems={DEFAULT_SETTINGS.stores}
        onAdd={addStore}
        onRemove={removeStore}
      />
    </div>
  )
}
