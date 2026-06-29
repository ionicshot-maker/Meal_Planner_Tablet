import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Recipe } from '@/types'
import styles from './RecipePicker.module.css'

interface Props {
  allRecipes: Recipe[]
  title?: string
  onPick: (recipe: Recipe) => void
  onClose: () => void
}

export function RecipePicker({ allRecipes, title = 'Pick a Recipe', onPick, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const nonTemplates = allRecipes.filter(r => !r.isTemplate)
  const allTags = Array.from(new Set(nonTemplates.flatMap(r => r.tags))).sort()

  const filtered = nonTemplates.filter(r => {
    if (activeTag && !r.tags.includes(activeTag)) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q))
    }
    return true
  })

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <input
            ref={searchRef}
            type="search"
            className={styles.search}
            placeholder="Search recipes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {allTags.length > 0 && (
          <div className={styles.tagBar}>
            <button
              className={`${styles.tag} ${activeTag === '' ? styles.tagActive : ''}`}
              onClick={() => setActiveTag('')}
            >All</button>
            {allTags.map(t => (
              <button
                key={t}
                className={`${styles.tag} ${activeTag === t ? styles.tagActive : ''}`}
                onClick={() => setActiveTag(t === activeTag ? '' : t)}
              >{t}</button>
            ))}
          </div>
        )}

        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No recipes match.</div>
          )}
          {filtered.map(r => (
            <button
              key={r.id}
              className={styles.item}
              onClick={() => { onPick(r); onClose() }}
            >
              <div className={styles.itemName}>{r.name}</div>
              <div className={styles.itemMeta}>
                {r.isFavorite && <span className={styles.fav}>♥</span>}
                {r.tags.slice(0, 3).map(t => (
                  <span key={t} className={styles.itemTag}>{t}</span>
                ))}
                {r.prepTimeMinutes + r.cookTimeMinutes > 0 && (
                  <span className={styles.itemTime}>
                    ⏱ {r.prepTimeMinutes + r.cookTimeMinutes}m
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
