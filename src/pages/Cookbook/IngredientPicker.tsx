import { useState, useEffect, useRef, useCallback } from 'react'
import { getAllIngredients } from '@/db/ingredients'
import type { Ingredient, IngredientVariant } from '@/types'
import styles from './IngredientPicker.module.css'

export interface PickedIngredient {
  ingredient: Ingredient
  variant: IngredientVariant
}

interface Props {
  onPick: (picked: PickedIngredient) => void
  onCreateNew?: (name: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function IngredientPicker({ onPick, onCreateNew, placeholder = 'Search ingredients…', autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const [all, setAll] = useState<Ingredient[]>([])
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    getAllIngredients(false).then(setAll)
  }, [])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const filtered = query.trim()
    ? all.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.variants.some(v => v.brand.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 12)
    : []

  function pick(ingredient: Ingredient, variant: IngredientVariant) {
    onPick({ ingredient, variant })
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Enter' && filtered.length === 0 && query.trim() && onCreateNew) {
      e.preventDefault()
      onCreateNew(query.trim())
      setQuery('')
      setOpen(false)
    }
  }

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!listRef.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => setOpen(false), 150)
    }
  }, [])

  return (
    <div className={styles.root}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => query && setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && query.trim() && (
        <ul ref={listRef} className={styles.dropdown} role="listbox">
          {filtered.length > 0
            ? filtered.map(ing => (
                <li key={ing.id}>
                  {ing.variants.length === 1 ? (
                    <button
                      className={styles.option}
                      onMouseDown={e => { e.preventDefault(); pick(ing, ing.variants[0]) }}
                      role="option"
                    >
                      <span className={styles.optionName}>{ing.name}</span>
                      <span className={styles.optionMeta}>{ing.category} · {ing.variants[0].brand}</span>
                    </button>
                  ) : (
                    <>
                      <div className={styles.optionHeader}>{ing.name}</div>
                      {ing.variants.map(v => (
                        <button
                          key={v.id}
                          className={`${styles.option} ${styles.optionVariant}`}
                          onMouseDown={e => { e.preventDefault(); pick(ing, v) }}
                          role="option"
                        >
                          <span className={styles.optionName}>{v.brand}</span>
                          <span className={styles.optionMeta}>{ing.category}</span>
                        </button>
                      ))}
                    </>
                  )}
                </li>
              ))
            : (
                <li>
                  {onCreateNew
                    ? (
                        <button
                          className={`${styles.option} ${styles.createNew}`}
                          onMouseDown={e => { e.preventDefault(); onCreateNew(query.trim()); setQuery(''); setOpen(false) }}
                        >
                          <span>+ Add "{query.trim()}" as missing ingredient</span>
                          <span className={styles.optionMeta}>Will be flagged — add to database before saving</span>
                        </button>
                      )
                    : <div className={styles.noResults}>No ingredients found</div>
                  }
                </li>
              )
          }
        </ul>
      )}
    </div>
  )
}
