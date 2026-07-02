import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { scoreIngredientMatch } from '@/utils/ingredientMatch'
import type { Ingredient, IngredientVariant } from '@/types'
import styles from './IngredientLinkModal.module.css'

interface ResultRow {
  ingredient: Ingredient
  variant: IngredientVariant
  score: number
}

interface Props {
  open: boolean
  initialQuery: string
  allIngredients: Ingredient[]
  onClose: () => void
  onPick: (ingredient: Ingredient, variant: IngredientVariant) => void
}

export function IngredientLinkModal({ open, initialQuery, allIngredients, onClose, onPick }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setQuery(initialQuery)
  }, [open, initialQuery])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    return () => clearTimeout(t)
  }, [open])

  const results = useMemo(() => {
    const q = query.trim()
    const rows: ResultRow[] = []
    for (const ing of allIngredients) {
      if (ing.archived) continue
      const score = q ? scoreIngredientMatch(ing.name, q) : 1
      if (score <= 0) continue
      for (const variant of ing.variants) {
        rows.push({ ingredient: ing, variant, score })
      }
    }
    rows.sort((a, b) =>
      b.score - a.score ||
      a.ingredient.name.localeCompare(b.ingredient.name) ||
      a.variant.brand.localeCompare(b.variant.brand)
    )
    return rows
  }, [allIngredients, query])

  function handleAddNew() {
    window.open(`/import-ingredients?q=${encodeURIComponent(query.trim())}`, '_blank')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link Ingredient"
      size="md"
      footer={
        <Button variant="secondary" onClick={handleAddNew}>
          No match — add this ingredient
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="text"
        className={styles.searchInput}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search ingredients…"
        autoComplete="off"
      />
      <div className={styles.resultList}>
        {results.length === 0 && (
          <p className={styles.noResults}>No ingredients match "{query.trim()}".</p>
        )}
        {results.map(({ ingredient, variant }) => (
          <button
            key={variant.id}
            type="button"
            className={styles.resultRow}
            onClick={() => onPick(ingredient, variant)}
          >
            <div className={styles.resultMain}>
              <span className={styles.resultName}>{ingredient.name}</span>
              {variant.brand && <span className={styles.resultBrand}>{variant.brand}</span>}
            </div>
            <div className={styles.resultMeta}>
              <span className={styles.resultCategory}>{ingredient.category}</span>
              <span className={styles.resultCalories}>{Math.round(variant.macros.calories)} cal/serving</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}
