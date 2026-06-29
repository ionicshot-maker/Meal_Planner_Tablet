import { useState, useEffect, useCallback } from 'react'
import {
  getAllRecipes, saveRecipe, deleteRecipe, cloneRecipeFromTemplate,
} from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { attachRecipeMacros, buildIngredientMap } from '@/utils/recipeCalculations'
import type { Recipe, Ingredient } from '@/types'
import type { AIRecipeResult } from '@/utils/aiImport'
import { RecipeCard } from './RecipeCard'
import { RecipeEditor } from './RecipeEditor'
import { RecipeDetail } from './RecipeDetail'
import { RecipeImportModal } from './RecipeImportModal'
import { AddToMealPlanModal } from './AddToMealPlanModal'
import { useHouseholdTitle } from '@/context/SettingsContext'
import styles from './CookbookPage.module.css'

type FilterMode = 'all' | 'favorites' | 'templates'

export default function CookbookPage() {
  const pageTitle = useHouseholdTitle('Cookbook')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  // Filter / search state
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [activeTag, setActiveTag] = useState('')

  // Modal / panel state
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null | 'new'>(null)
  const [importPrefill, setImportPrefill] = useState<AIRecipeResult | null>(null)
  const [referenceText, setReferenceText] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [addToPlanRecipe, setAddToPlanRecipe] = useState<Recipe | null>(null)

  const load = useCallback(async () => {
    const [recs, ings] = await Promise.all([getAllRecipes(true), getAllIngredients(false)])
    const map = buildIngredientMap(ings)
    const withMacros = recs.map(r => attachRecipeMacros(r, map))
    setRecipes(withMacros)
    setAllIngredients(ings)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Derive available tags from all recipes
  const allTags = Array.from(new Set(recipes.flatMap(r => r.tags))).sort()

  // Filtered list
  const filtered = recipes.filter(r => {
    if (filterMode === 'favorites' && !r.isFavorite) return false
    if (filterMode === 'templates' && !r.isTemplate) return false
    if (filterMode === 'all' && r.isTemplate) return false
    if (activeTag && !r.tags.includes(activeTag)) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q))
    }
    return true
  })

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleSave(recipe: Recipe) {
    await saveRecipe(recipe)
    await load()
    setEditingRecipe(null)
    setImportPrefill(null)
    setReferenceText(null)
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Delete "${recipe.name}"? This cannot be undone.`)) return
    await deleteRecipe(recipe.id)
    setViewingRecipe(null)
    await load()
  }

  async function handleToggleFavorite(recipe: Recipe) {
    const updated = { ...recipe, isFavorite: !recipe.isFavorite, updatedAt: new Date().toISOString() }
    await saveRecipe(updated)
    setViewingRecipe(v => v?.id === recipe.id ? updated : v)
    setRecipes(prev => prev.map(r => r.id === recipe.id ? updated : r))
  }

  async function handleSaveAsTemplate(recipe: Recipe) {
    const template = { ...recipe, isTemplate: true, isFavorite: false, updatedAt: new Date().toISOString() }
    await saveRecipe(template)
    await load()
  }

  function handleUseTemplate(recipe: Recipe) {
    const copy = cloneRecipeFromTemplate(recipe)
    setImportPrefill(null)
    setEditingRecipe(copy)
  }

  function handleImported(result: AIRecipeResult) {
    setShowImport(false)
    setImportPrefill(result)
    setEditingRecipe('new')
  }

  function handleManualWithReference(text: string) {
    setShowImport(false)
    setReferenceText(text)
    setImportPrefill(null)
    setEditingRecipe('new')
  }

  function openEdit(recipe: Recipe) {
    setViewingRecipe(null)
    setImportPrefill(null)
    setEditingRecipe(recipe)
  }

  function openView(recipe: Recipe) {
    setViewingRecipe(recipe)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{pageTitle}</h1>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recipes…"
        />

        <div className={styles.filterBtns}>
          {(['all', 'favorites', 'templates'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              className={`${styles.filterBtn} ${filterMode === mode ? styles.filterBtnActive : ''}`}
              onClick={() => { setFilterMode(mode); setActiveTag('') }}
            >
              {mode === 'all' ? 'All Recipes' : mode === 'favorites' ? '♥ Favorites' : 'Templates'}
            </button>
          ))}
        </div>

        <div className={styles.toolbarRight}>
          <button className={styles.importBtn} onClick={() => setShowImport(true)}>
            Import Recipe
          </button>
          <button className={styles.createBtn} onClick={() => { setImportPrefill(null); setEditingRecipe('new') }}>
            + New Recipe
          </button>
        </div>
      </div>

      {/* ── Tag filter bar ── */}
      {allTags.length > 0 && (
        <div className={styles.tagBar}>
          <button
            className={`${styles.tagPill} ${activeTag === '' ? styles.tagPillActive : ''}`}
            onClick={() => setActiveTag('')}
          >
            All tags
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`${styles.tagPill} ${activeTag === tag ? styles.tagPillActive : ''}`}
              onClick={() => setActiveTag(t => t === tag ? '' : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className={styles.empty}>Loading recipes…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          {recipes.filter(r => !r.isTemplate).length === 0 && filterMode === 'all' && !search && !activeTag
            ? (
                <div className={styles.emptyState}>
                  <p className={styles.emptyTitle}>Your cookbook is empty</p>
                  <p className={styles.emptySubtitle}>Add your first recipe or import one from a URL.</p>
                  <div className={styles.emptyActions}>
                    <button className={styles.createBtn} onClick={() => { setImportPrefill(null); setEditingRecipe('new') }}>+ New Recipe</button>
                    <button className={styles.importBtn} onClick={() => setShowImport(true)}>Import Recipe</button>
                  </div>
                </div>
              )
            : <span>No recipes match your filters.</span>
          }
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onView={() => openView(recipe)}
              onEdit={() => openEdit(recipe)}
              onToggleFavorite={() => handleToggleFavorite(recipe)}
              onSaveAsTemplate={() => handleSaveAsTemplate(recipe)}
              onDelete={() => handleDelete(recipe)}
              onUseTemplate={() => handleUseTemplate(recipe)}
              onAddToMealPlan={() => setAddToPlanRecipe(recipe)}
            />
          ))}
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <RecipeImportModal
          onImported={handleImported}
          onManualWithReference={handleManualWithReference}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ── Editor ── */}
      {editingRecipe !== null && (
        <RecipeEditor
          recipe={editingRecipe === 'new' ? undefined : editingRecipe}
          prefill={importPrefill ?? undefined}
          fromImport={importPrefill !== null}
          referenceText={referenceText ?? undefined}
          onSave={handleSave}
          onClose={() => { setEditingRecipe(null); setImportPrefill(null); setReferenceText(null) }}
        />
      )}

      {/* ── Detail view ── */}
      {viewingRecipe && (
        <RecipeDetail
          recipe={viewingRecipe}
          allIngredients={allIngredients}
          onEdit={() => openEdit(viewingRecipe)}
          onClose={() => setViewingRecipe(null)}
          onToggleFavorite={() => handleToggleFavorite(viewingRecipe)}
          onDelete={() => handleDelete(viewingRecipe)}
          onAddToMealPlan={() => setAddToPlanRecipe(viewingRecipe)}
        />
      )}

      {/* ── Add to Meal Plan ── */}
      {addToPlanRecipe && (
        <AddToMealPlanModal
          recipeId={addToPlanRecipe.id}
          recipeName={addToPlanRecipe.name}
          onClose={() => setAddToPlanRecipe(null)}
        />
      )}
    </div>
  )
}
