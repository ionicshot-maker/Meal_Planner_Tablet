import { useState } from 'react'
import { Calculator, Search } from 'lucide-react'
import type { KitchenReference } from '@/types'
import { CONTENT_TYPES } from './referenceContentTypes'
import { ReferenceCard } from './ReferenceCard'
import styles from './ReferenceTab.module.css'

interface Props {
  references: KitchenReference[]
  onView: (ref: KitchenReference) => void
  onEdit: (ref: KitchenReference) => void
  onDelete: (ref: KitchenReference) => void
  onOpenCalculator: () => void
}

export function ReferenceTab({ references, onView, onEdit, onDelete, onOpenCalculator }: Props) {
  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<string>('')
  const [activeSourceTag, setActiveSourceTag] = useState('')

  const allSourceTags = Array.from(new Set(references.flatMap(r => r.sourceTags))).sort()

  const filtered = references.filter(r => {
    if (activeType && r.contentType !== activeType) return false
    if (activeSourceTag && !r.sourceTags.includes(activeSourceTag)) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.title.toLowerCase().includes(q)
        || r.content.toLowerCase().includes(q)
        || r.sourceTags.some(t => t.toLowerCase().includes(q))
    }
    return true
  })

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reference content…"
          />
        </div>
      </div>

      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Type:</span>
        <button
          className={`${styles.filterPill} ${activeType === '' ? styles.filterPillActive : ''}`}
          onClick={() => setActiveType('')}
        >
          All
        </button>
        {CONTENT_TYPES.map(ct => (
          <button
            key={ct.value}
            className={`${styles.filterPill} ${activeType === ct.value ? styles.filterPillActive : ''}`}
            onClick={() => setActiveType(t => t === ct.value ? '' : ct.value)}
          >
            <ct.Icon size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{ct.label}
          </button>
        ))}
      </div>

      {allSourceTags.length > 0 && (
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Source:</span>
          {allSourceTags.map(tag => (
            <button
              key={tag}
              className={`${styles.filterPill} ${activeSourceTag === tag ? styles.filterPillActive : ''}`}
              onClick={() => setActiveSourceTag(t => t === tag ? '' : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className={styles.grid}>
        {/* Conversion Calculator — always pinned first */}
        <article className={styles.calcCard} onClick={onOpenCalculator}>
          <div className={styles.calcIcon}><Calculator size={22} /></div>
          <div className={styles.calcBody}>
            <h2 className={styles.calcTitle}>Conversion Calculator</h2>
            <p className={styles.calcDesc}>Convert weight, volume, and oven temperatures instantly.</p>
          </div>
        </article>

        {filtered.map(ref => (
          <ReferenceCard
            key={ref.id}
            reference={ref}
            onView={() => onView(ref)}
            onEdit={() => onEdit(ref)}
            onDelete={() => onDelete(ref)}
          />
        ))}
      </div>

      {references.length > 0 && filtered.length === 0 && (
        <div className={styles.empty}>No reference entries match your filters.</div>
      )}
    </div>
  )
}
