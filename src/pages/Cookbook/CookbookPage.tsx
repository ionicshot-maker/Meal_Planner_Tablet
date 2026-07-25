import { useState, useEffect, useCallback } from 'react'
import { Heart, Download, Plus, FolderOpen, BookMarked } from 'lucide-react'
import {
  getAllRecipes, saveRecipe, deleteRecipe, cloneRecipeFromTemplate,
} from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { getAllCollections, createCollection, addRecipeToCollection, saveCollection, deleteCollection } from '@/db/collections'
import { getAllReferences, saveReference, deleteReference } from '@/db/references'
import { attachRecipeMacros, buildIngredientMap } from '@/utils/recipeCalculations'
import type { Recipe, Ingredient, RecipeCollection, KitchenReference } from '@/types'
import type { AIRecipeResult, UncertainField } from '@/utils/aiImport'
import { RecipeCard } from './RecipeCard'
import { RecipeEditor, type ImportNotice } from './RecipeEditor'
import { RecipeDetail } from './RecipeDetail'
import { RecipeImportModal } from './RecipeImportModal'
import { AddToMealPlanModal } from './AddToMealPlanModal'
import { CollectionsTab } from './CollectionsTab'
import { ReferenceTab } from './ReferenceTab'
import { ReferenceEditor } from './ReferenceEditor'
import { ReferenceDetail } from './ReferenceDetail'
import { Modal, Button } from '@/components/ui'
import { ConversionCalculator } from '@/components/ConversionCalculator'
import { useHouseholdTitle } from '@/context/SettingsContext'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './CookbookPage.module.css'

type FilterMode = 'all' | 'favorites' | 'templates' | 'collections' | 'reference'

export default function CookbookPage() {
  const pageTitle = useHouseholdTitle('Cookbook')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [collections, setCollections] = useState<RecipeCollection[]>([])
  const [references, setReferences] = useState<KitchenReference[]>([])
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
  // Phase 2A — "crop another recipe from this same photo." Holds the
  // original, un-cropped source photo across a photo-sourced import's whole
  // review-and-save cycle (the only component alive that whole span). Set
  // only when the import was photo-sourced; stays null for every other
  // import path, and is the single condition that gates the offer below.
  const [importSourcePhoto, setImportSourcePhoto] = useState<string | null>(null)
  const [showCropAnotherOffer, setShowCropAnotherOffer] = useState(false)

  // Kitchen Reference state
  const [editingReference, setEditingReference] = useState<KitchenReference | null | 'new'>(null)
  const [viewingReference, setViewingReference] = useState<KitchenReference | null>(null)
  const [showCalculator, setShowCalculator] = useState(false)

  const load = useCallback(async () => {
    const [recs, ings, cols, refs] = await Promise.all([
      getAllRecipes(true),
      getAllIngredients(false),
      getAllCollections(),
      getAllReferences(),
    ])
    const map = buildIngredientMap(ings)
    const withMacros = recs.map(r => attachRecipeMacros(r, map))
    setRecipes(withMacros)
    setReferences(refs)
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
    if (filterMode === 'collections' || filterMode === 'reference') return false
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
    // Deliberately does NOT clear importSourcePhoto here — a successful save
    // is the one condition Phase 2A's offer depends on; it stays set until
    // the user's next choice (crop another / I'm done) resolves it.
    if (importSourcePhoto) setShowCropAnotherOffer(true)
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

  function handleImported(result: AIRecipeResult, notice?: ImportNotice, uncertainFields?: UncertainField[], sourcePhotoDataUrl?: string) {
    setShowImport(false)
    setImportPrefill(result)
    setImportNotice(notice)
    setImportUncertainFields(uncertainFields)
    // Unconditional (not `if (sourcePhotoDataUrl) ...`) so a non-photo import
    // never leaves a stale photo behind from an earlier photo-sourced one —
    // URL/paste imports always resolve this to null.
    setImportSourcePhoto(sourcePhotoDataUrl ?? null)
    setShowCropAnotherOffer(false)
    setEditingRecipe('new')
  }

  function handleManualWithReference(text: string) {
    setShowImport(false)
    setReferenceText(text)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setImportSourcePhoto(null)
    setEditingRecipe('new')
  }

  function handleManualEntry() {
    setShowImport(false)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setImportSourcePhoto(null)
    setEditingRecipe('new')
  }

  function handleCropAnother() {
    setShowCropAnotherOffer(false)
    setShowImport(true) // importSourcePhoto stays set — passed back in as initialPhotoDataUrl below
  }

  function handleDoneWithPhoto() {
    setShowCropAnotherOffer(false)
    setImportSourcePhoto(null)
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

  // ── Kitchen Reference actions ────────────────────────────────────────────
  async function handleSaveReference(ref: KitchenReference) {
    await saveReference(ref)
    await load()
    setEditingReference(null)
    setViewingReference(null)
  }

  async function handleDeleteReference(ref: KitchenReference) {
    if (!confirm(`Delete "${ref.title}"? This cannot be undone.`)) return
    await deleteReference(ref.id)
    setViewingReference(null)
    await load()
  }

  function openEditReference(ref: KitchenReference) {
    setViewingReference(null)
    setEditingReference(ref)
  }

  return (
    <div className={styles.page}>
      <div className={styles.headingGroup}>
        <h1 className={styles.pageTitle}>{pageTitle}</h1>
        <p className={styles.countIndicator}>{recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}</p>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        {filterMode !== 'reference' && (
          <input
            type="search"
            className={styles.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes…"
          />
        )}

        <div className={styles.filterBtns}>
          {(['all', 'favorites', 'templates', 'collections', 'reference'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              className={`${styles.filterBtn} ${filterMode === mode ? styles.filterBtnActive : ''}`}
              onClick={() => { setFilterMode(mode); setActiveTag('') }}
            >
              {mode === 'all' ? 'All Recipes'
                : mode === 'favorites' ? <><Heart size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Favorites</>
                : mode === 'templates' ? 'Templates'
                : mode === 'collections' ? <><FolderOpen size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Collections</>
                : <><BookMarked size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Reference</>}
            </button>
          ))}
        </div>

        <div className={styles.toolbarRight}>
          {filterMode === 'reference' ? (
            <button className={styles.createBtn} onClick={() => setEditingReference('new')} title="Add Reference">
              <Plus size={15} style={{ verticalAlign: 'middle', marginRight: 2 }} /><span className={styles.btnLabel}>Add Reference</span>
            </button>
          ) : (
            <>
              <button className={styles.importBtn} onClick={() => setShowImport(true)} title="Import Recipe">
                <Download size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} /><span className={styles.btnLabel}>Import Recipe</span>
              </button>
              <button className={styles.createBtn} onClick={() => { setImportPrefill(null); setEditingRecipe('new') }} title="New Recipe">
                <Plus size={15} style={{ verticalAlign: 'middle', marginRight: 2 }} /><span className={styles.btnLabel}>New Recipe</span>
              </button>
            </>
          )}
          <PageHelpButton />
        </div>
      </div>

      {/* ── Tag filter bar ── */}
      {filterMode !== 'collections' && filterMode !== 'reference' && allTags.length > 0 && (
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
      {filterMode === 'reference' ? (
        <ReferenceTab
          references={references}
          onView={setViewingReference}
          onEdit={openEditReference}
          onDelete={handleDeleteReference}
          onOpenCalculator={() => setShowCalculator(true)}
        />
      ) : filterMode === 'collections' ? (
        <CollectionsTab
          collections={collections}
          recipes={recipes}
          references={references}
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
              allIngredients={allIngredients}
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
          onClose={() => {
            setShowImport(false)
            // Closing the modal outright (not via a completed import) is
            // also "the user's next choice" resolving — clears a
            // crop-another photo rather than letting it silently reappear
            // pre-seeded into some unrelated later import.
            setImportSourcePhoto(null)
          }}
          initialPhotoDataUrl={importSourcePhoto ?? undefined}
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
            // Cancelling the review instead of saving clears a
            // photo-sourced import's source photo too — the offer only
            // ever follows a successful save.
            setImportSourcePhoto(null)
          }}
        />
      )}

      {/* ── Phase 2A: crop-another-recipe offer, shown after a photo-sourced save ── */}
      <Modal
        open={showCropAnotherOffer}
        onClose={handleDoneWithPhoto}
        title="Crop Another Recipe?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleDoneWithPhoto}>I'm Done With This Photo</Button>
            <Button onClick={handleCropAnother}>Crop Another From This Photo</Button>
          </>
        }
      >
        <p>You just saved a recipe imported from a photo. Want to crop another recipe from that same photo?</p>
      </Modal>

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

      {/* ── Kitchen Reference editor / detail / calculator ── */}
      {editingReference !== null && (
        <ReferenceEditor
          reference={editingReference === 'new' ? undefined : editingReference}
          onSave={handleSaveReference}
          onClose={() => setEditingReference(null)}
        />
      )}

      {viewingReference && (
        <ReferenceDetail
          reference={viewingReference}
          onEdit={() => openEditReference(viewingReference)}
          onDelete={() => handleDeleteReference(viewingReference)}
          onClose={() => setViewingReference(null)}
        />
      )}

      <Modal open={showCalculator} onClose={() => setShowCalculator(false)} title="Conversion Calculator" size="sm">
        <ConversionCalculator />
      </Modal>
    </div>
  )
}
