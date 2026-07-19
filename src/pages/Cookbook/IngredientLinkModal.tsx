import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { scoreIngredientMatch } from '@/utils/ingredientMatch'
import { Toast } from '@/pages/IngredientImport/Toast'
import { MiniIngredientImportPanel } from './MiniIngredientImportPanel'
import type { Ingredient, IngredientVariant } from '@/types'
import styles from './IngredientLinkModal.module.css'

interface ResultRow {
  ingredient: Ingredient
  variant: IngredientVariant
  score: number
  isNew: boolean
}

interface JustAdded {
  ingredientId: string
  variantId: string
}

interface Props {
  open: boolean
  initialQuery: string
  allIngredients: Ingredient[]
  onClose: () => void
  onPick: (ingredient: Ingredient, variant: IngredientVariant) => void
  onIngredientSaved: (ingredient: Ingredient) => void
}

export function IngredientLinkModal({ open, initialQuery, allIngredients, onClose, onPick, onIngredientSaved }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [mode, setMode] = useState<'pick' | 'import'>('pick')
  const [justAdded, setJustAdded] = useState<JustAdded | null>(null)
  const [showLinkedToast, setShowLinkedToast] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setMode('pick')
      setJustAdded(null)
    }
  }, [open, initialQuery])

  useEffect(() => {
    if (!open || mode !== 'pick') return
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    return () => clearTimeout(t)
  }, [open, mode])

  const results = useMemo(() => {
    const q = query.trim()
    const rows: ResultRow[] = []
    for (const ing of allIngredients) {
      if (ing.archived) continue
      const score = q ? scoreIngredientMatch(ing.name, q) : 1
      if (score <= 0) continue
      for (const variant of ing.variants) {
        rows.push({ ingredient: ing, variant, score, isNew: false })
      }
    }
    rows.sort((a, b) =>
      b.score - a.score ||
      a.ingredient.name.localeCompare(b.ingredient.name) ||
      a.variant.brand.localeCompare(b.variant.brand)
    )

    // Pin the just-added ingredient's newest variant to the top so it's easy to find,
    // regardless of whether it happens to match the current search text.
    if (justAdded) {
      const idx = rows.findIndex(r => r.variant.id === justAdded.variantId)
      let pinned: ResultRow | undefined
      if (idx >= 0) {
        pinned = { ...rows[idx], isNew: true }
        rows.splice(idx, 1)
      } else {
        const ing = allIngredients.find(i => i.id === justAdded.ingredientId)
        const variant = ing?.variants.find(v => v.id === justAdded.variantId)
        if (ing && variant) pinned = { ingredient: ing, variant, score: Infinity, isNew: true }
      }
      if (pinned) rows.unshift(pinned)
    }

    return rows
  }, [allIngredients, query, justAdded])

  function handlePick(ingredient: Ingredient, variant: IngredientVariant) {
    const wasJustAdded = justAdded?.variantId === variant.id
    onPick(ingredient, variant)
    if (wasJustAdded) setShowLinkedToast(true)
  }

  function handleIngredientSaved(ingredient: Ingredient) {
    onIngredientSaved(ingredient)
    const newestVariant = ingredient.variants[ingredient.variants.length - 1]
    setJustAdded({ ingredientId: ingredient.id, variantId: newestVariant.id })
    setQuery('')
    setMode('pick')
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={mode === 'import' ? 'Add New Ingredient' : 'Link Ingredient'}
        size={mode === 'import' ? 'lg' : 'md'}
        footer={mode === 'pick'
          ? (
              <Button variant="secondary" onClick={() => setMode('import')}>
                No match — add this ingredient
              </Button>
            )
          : undefined
        }
      >
        {mode === 'import'
          ? (
              <MiniIngredientImportPanel
                initialQuery={query}
                onSaved={handleIngredientSaved}
                onBack={() => setMode('pick')}
              />
            )
          : (
              <>
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
                  {results.map(({ ingredient, variant, isNew }) => (
                    <button
                      key={variant.id}
                      type="button"
                      className={`${styles.resultRow} ${isNew ? styles.resultRowNew : ''}`}
                      onClick={() => handlePick(ingredient, variant)}
                    >
                      <div className={styles.resultMain}>
                        <span className={styles.resultNameRow}>
                          <span className={styles.resultName}>{ingredient.name}</span>
                          {isNew && <span className={styles.newBadge}>New</span>}
                        </span>
                        {variant.brand && <span className={styles.resultBrand}>{variant.brand}</span>}
                      </div>
                      <div className={styles.resultMeta}>
                        <span className={styles.resultCategory}>{ingredient.category}</span>
                        <span className={styles.resultCalories}>{Math.round(variant.macros?.calories ?? 0)} cal/serving</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )
        }
      </Modal>

      {showLinkedToast && (
        <Toast message="Ingredient added and linked successfully" onDone={() => setShowLinkedToast(false)} />
      )}
    </>
  )
}
