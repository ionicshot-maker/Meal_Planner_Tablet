import { useState, useEffect, useCallback } from 'react'
import { Heart, Download, Plus, FolderOpen } from 'lucide-react'
import {
  getAllRecipes, saveRecipe, deleteRecipe, cloneRecipeFromTemplate,
} from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { getAllCollections, createCollection, addRecipeToCollection, saveCollection, deleteCollection } from '@/db/collections'
import { attachRecipeMacros, buildIngredientMap } from '@/utils/recipeCalculations'
import type { Recipe, Ingredient, RecipeCollection } from '@/types'
import type { AIRecipeResult, UncertainField } from '@/utils/aiImport'
import { RecipeCard } from './RecipeCard'
import { RecipeEditor, type ImportNotice } from './RecipeEditor'
import { RecipeDetail } from './RecipeDetail'
import { RecipeImportModal } from './RecipeImportModal'
import { AddToMealPlanModal } from './AddToMealPlanModal'
import { CollectionsTab } from './CollectionsTab'
import { useHouseholdTitle } from '@/context/SettingsContext'
import styles from './CookbookPage.module.css'

type FilterMode = 'all' | 'favorites' | 'templates' | 'collections'

export default function CookbookPage() {
  const pageTitle = useHouseholdTitle('Cookbook')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [collections, setCollections] = useState<RecipeCollection[]>([])
  const [loading, setLoading] = useState(true)

  // Filter / search state
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [activeTag, setActiveTag] = useState('')

  // Modal / panel state
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null | 'new'>(null)
  const [importPrefill, setImportPrefill] = useState<AIRecipeResult | null>(null)
  const [importNotice, setImportNotice] = useState<ImportNotice | undefined>(undefined)
  const [importUncertainFields, setImportUncertainFields] = useState<UncertainField[] | undefined>(undefined)
  const [referenceText, setReferenceText] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [addToPlanRecipe, setAddToPlanRecipe] = useState<Recipe | null>(null)

  const load = useCallback(async () => {
    const [recs, ings, cols] = await Promise.all([
      getAllRecipes(true),
      getAllIngredients(false),
      getAllCollections(),
    ])
    const map = buildIngredientMap(ings)
    const withMacros = recs.map(r => attachRecipeMacros(r, map))
    setRecipes(withMacros)
    setAllIngredients(ings)
    setCollections(cols)
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
    if (filterMode === 'collections') return false
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
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
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

  function handleImported(result: AIRecipeResult, notice?: ImportNotice, uncertainFields?: UncertainField[]) {
    setShowImport(false)
    setImportPrefill(result)
    setImportNotice(notice)
    setImportUncertainFields(uncertainFields)
    setEditingRecipe('new')
  }

  function handleManualWithReference(text: string) {
    setShowImport(false)
    setReferenceText(text)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setEditingRecipe('new')
  }

  function handleManualEntry() {
    setShowImport(false)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setEditingRecipe('new')
  }

  function openEdit(recipe: Recipe) {
    setViewingRecipe(null)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setEditingRecipe(recipe)
  }

  function openView(recipe: Recipe) {
    setViewingRecipe(recipe)
  }

  async function handleAddToCollection(collectionId: string, recipeId: string) {
    await addRecipeToCollection(collectionId, recipeId)
    await load()
  }

  async function handleCreateAndAddCollection(name: string, recipeId: string) {
    const c = await createCollection(name)
    await addRecipeToCollection(c.id, recipeId)
    await load()
  }

  async function handleSaveCollection(c: RecipeCollection) {
    await saveCollection(c)
    await load()
  }

  async function handleDeleteCollection(id: string) {
    await deleteCollection(id)
    await load()
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
          {(['all', 'favorites', 'templates', 'collections'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              className={`${styles.filterBtn} ${filterMode === mode ? styles.filterBtnActive : ''}`}
              onClick={() => { setFilterMode(mode); setActiveTag('') }}
            >
              {mode === 'all' ? 'All Recipes'
                : mode === 'favorites' ? <><Heart size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Favorites</>
                : mode === 'templates' ? 'Templates'
                : <><FolderOpen size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Collections</>}
            </button>
          ))}
        </div>

        <div className={styles.toolbarRight}>
          <button className={styles.importBtn} onClick={() => setShowImport(true)}>
            <Download size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />Import Recipe
          </button>
          <button className={styles.createBtn} onClick={() => { setImportPrefill(null); setEditingRecipe('new') }}>
            <Plus size={15} style={{ verticalAlign: 'middle', marginRight: 2 }} />New Recipe
          </button>
        </div>
      </div>

      {/* ── Tag filter bar ── */}
      {filterMode !== 'collections' && allTags.length > 0 && (
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
      {filterMode === 'collections' ? (
        <CollectionsTab
          collections={collections}
          recipes={recipes}
          onSaveCollection={handleSaveCollection}
          onDeleteCollection={handleDeleteCollection}
          onCreateCollection={async (name) => { await createCollection(name); await load() }}
          onViewRecipe={openView}
        />
      ) : loading ? (
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
              collections={collections}
              onView={() => openView(recipe)}
              onEdit={() => openEdit(recipe)}
              onToggleFavorite={() => handleToggleFavorite(recipe)}
              onSaveAsTemplate={() => handleSaveAsTemplate(recipe)}
              onDelete={() => handleDelete(recipe)}
              onUseTemplate={() => handleUseTemplate(recipe)}
              onAddToMealPlan={() => setAddToPlanRecipe(recipe)}
              onAddToCollection={(collectionId) => handleAddToCollection(collectionId, recipe.id)}
              onCreateCollection={(name) => handleCreateAndAddCollection(name, recipe.id)}
            />
          ))}
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <RecipeImportModal
          onImported={handleImported}
          onManualWithReference={handleManualWithReference}
          onManualEntry={handleManualEntry}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ── Editor ── */}
      {editingRecipe !== null && (
        <RecipeEditor
          recipe={editingRecipe === 'new' ? undefined : editingRecipe}
          prefill={importPrefill ?? undefined}
          fromImport={importPrefill !== null}
          importNotice={importNotice}
          uncertainFields={importUncertainFields}
          referenceText={referenceText ?? undefined}
          onSave={handleSave}
          onClose={() => {
            setEditingRecipe(null)
            setImportPrefill(null)
            setImportNotice(undefined)
            setImportUncertainFields(undefined)
            setReferenceText(null)
          }}
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
