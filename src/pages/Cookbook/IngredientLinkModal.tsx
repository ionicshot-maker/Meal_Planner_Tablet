import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { scoreIngredientMatch } from '@/utils/ingredientMatch'
import { suggestCategory } from '@/utils/categoryRules'
import { getRecentlyLinked, recordLinked } from '@/utils/recentlyLinked'
import { Toast } from '@/pages/IngredientImport/Toast'
import { MiniIngredientImportPanel } from './MiniIngredientImportPanel'
import type { Ingredient, IngredientVariant } from '@/types'
import styles from './IngredientLinkModal.module.css'

const RESULT_LIMIT = 20

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
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined)
  const [recentEntries, setRecentEntries] = useState<{ ingredientId: string; variantId: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setMode('pick')
      setJustAdded(null)
      // Guess a category from the recipe ingredient's name so the list starts
      // narrowed down instead of showing all 9,000+ ingredients at once. Computed
      // once per opening — editing the search text afterward doesn't re-guess.
      setCategoryFilter(suggestCategory(initialQuery))
      setRecentEntries(getRecentlyLinked())
    }
  }, [open, initialQuery])

  useEffect(() => {
    if (!open || mode !== 'pick') return
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    return () => clearTimeout(t)
  }, [open, mode])

  // All ingredient/variant rows matching the current search text and category
  // filter, sorted by relevance (exact match first, then closer partial matches,
  // then everything else) and alphabetically within each relevance tier.
  const matches = useMemo(() => {
    const q = query.trim()
    const rows: ResultRow[] = []
    for (const ing of allIngredients) {
      if (ing.archived) continue
      if (categoryFilter && ing.category !== categoryFilter) continue
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
    return rows
  }, [allIngredients, query, categoryFilter])

  // Recently-linked ingredients (across all recipes) that still match the current
  // search/category filter, shown as a shortcut section above the main results.
  const recentRows = useMemo(() => {
    const q = query.trim()
    const rows: ResultRow[] = []
    for (const entry of recentEntries) {
      const ing = allIngredients.find(i => i.id === entry.ingredientId)
      if (!ing || ing.archived) continue
      if (categoryFilter && ing.category !== categoryFilter) continue
      const variant = ing.variants.find(v => v.id === entry.variantId)
      if (!variant) continue
      const score = q ? scoreIngredientMatch(ing.name, q) : 1
      if (score <= 0) continue
      rows.push({ ingredient: ing, variant, score, isNew: false })
    }
    return rows
  }, [allIngredients, query, categoryFilter, recentEntries])

  const results = useMemo(() => {
    const recentVariantIds = new Set(recentRows.map(r => r.variant.id))
    let rows = matches.filter(r => !recentVariantIds.has(r.variant.id))

    // Pin the just-added ingredient's newest variant to the top so it's easy to
    // find, regardless of whether it happens to match the current search/category.
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
      if (pinned) rows = [pinned, ...rows]
    }

    return rows
  }, [matches, recentRows, justAdded, allIngredients])

  const visibleResults = results.slice(0, RESULT_LIMIT)
  const totalMatches = matches.length

  function handlePick(ingredient: Ingredient, variant: IngredientVariant) {
    const wasJustAdded = justAdded?.variantId === variant.id
    recordLinked(ingredient.id, variant.id)
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

  function renderRow({ ingredient, variant, isNew }: ResultRow) {
    return (
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
    )
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
                {categoryFilter && (
                  <div className={styles.categoryFilterBar}>
                    <span className={styles.categoryLabel}>Showing: {categoryFilter}</span>
                    <button
                      type="button"
                      className={styles.showAllBtn}
                      onClick={() => setCategoryFilter(undefined)}
                    >
                      Show all categories
                    </button>
                  </div>
                )}
                <div className={styles.resultList}>
                  {recentRows.length > 0 && (
                    <>
                      <div className={styles.sectionLabel}>Recently used</div>
                      {recentRows.map(renderRow)}
                      <div className={styles.sectionLabel}>Search results</div>
                    </>
                  )}
                  {visibleResults.length === 0 && recentRows.length === 0 && (
                    <p className={styles.noResults}>No ingredients match "{query.trim()}".</p>
                  )}
                  {visibleResults.map(renderRow)}
                </div>
                {totalMatches > RESULT_LIMIT && (
                  <p className={styles.resultCount}>
                    Showing {RESULT_LIMIT} of {totalMatches} matches — refine your search to narrow results
                  </p>
                )}
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
