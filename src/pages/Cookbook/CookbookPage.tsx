import { useState, useEffect, useCallback, useRef } from 'react'
import { Heart, Download, Plus, FolderOpen, BookMarked } from 'lucide-react'
import {
  getAllRecipes, saveRecipe, deleteRecipe, cloneRecipeFromTemplate,
} from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { getAllCollections, createCollection, addRecipeToCollection, saveCollection, deleteCollection } from '@/db/collections'
import { getAllReferences, saveReference, deleteReference } from '@/db/references'
import { attachRecipeMacros, buildIngredientMap } from '@/utils/recipeCalculations'
import type { Recipe, Ingredient, RecipeCollection, KitchenReference } from '@/types'
import type { AIRecipeResult, UncertainField, DetectedRecipeBox } from '@/utils/aiImport'
import { detectRecipeBoxes, effectivePhotoGeminiKey } from '@/utils/aiImport'
import { normalizeDetectionResponse } from '@/components/PhotoCaptureCrop'
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
import { useHouseholdTitle, useSettings } from '@/context/SettingsContext'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './CookbookPage.module.css'

type FilterMode = 'all' | 'favorites' | 'templates' | 'collections' | 'reference'

export default function CookbookPage() {
  const pageTitle = useHouseholdTitle('Cookbook')
  const { settings } = useSettings()
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
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'recipe'; item: Recipe } | { kind: 'reference'; item: KitchenReference } | null
  >(null)
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
  // Phase 2C-2 — AI-suggested crop boxes, unified across recipe #1 and every
  // "Crop Another" cycle for recipe #2+ on the same photo. Populated once
  // per photo, fired from handlePhotoSelected the instant a *new* photo is
  // acquired (Phase 2C-1 originally fired this from handleImported, after
  // recipe #1's OCR succeeded — moved earlier so recipe #1's own crop screen
  // can also receive a suggestion; see handlePhotoSelected's comment).
  // Index 0 belongs to recipe #1 — consumed opportunistically by the effect
  // below the moment it's available, whichever crop screen is currently
  // open. Every later index is consumed one at a time by handleCropAnother
  // as the user cycles through "Crop Another" — since index 0 is always
  // claimed (one way or another — see below) before a "Crop Another" cycle
  // can be reached, `detectedBoxes[0]` at that point is always the *next*
  // unclaimed box, so handleCropAnother needed no change for this phase. An
  // empty or exhausted array is indistinguishable from "detection never ran"
  // to every consumer, so the fallback to today's default crop is automatic.
  // Elements are already normalizeDetectionResponse()-cleaned by the time
  // they land here (see runBoundaryDetection) — a `null` entry means that
  // specific box couldn't be resolved to a sane box and was discarded at
  // the response level; consuming it must fall back to no suggestion for
  // that one cycle without disturbing the other (still-valid) boxes.
  const [detectedBoxes, setDetectedBoxes] = useState<(DetectedRecipeBox | null)[]>([])
  const [activeCropBox, setActiveCropBox] = useState<DetectedRecipeBox | undefined>(undefined)
  // Guards against a stale, superseded detection call (started for a photo
  // the user has since moved on from — e.g. Back, then a different photo)
  // resolving late and overwriting a newer photo's boxes. Set synchronously
  // at the start of every detection call; a resolving call only commits its
  // result if it's still the most recently requested one.
  const detectionPhotoRef = useRef<string | null>(null)

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
    await deleteRecipe(recipe.id)
    setViewingRecipe(null)
    await load()
    setPendingDelete(null)
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
    // This box, if any, has now been consumed by the recipe just extracted —
    // clear it regardless of path so a stale suggestion can't leak into some
    // unrelated later crop. (Detection itself no longer fires from here as of
    // Phase 2C-2 — see handlePhotoSelected — so there's no re-trigger logic
    // needed at this point anymore; detectedBoxes is left untouched, exactly
    // the still-unconsumed queue a later "Crop Another" cycle needs.)
    setActiveCropBox(undefined)
    setImportSourcePhoto(sourcePhotoDataUrl ?? null)
    setShowCropAnotherOffer(false)
    setEditingRecipe('new')
  }

  // Phase 2C-2 — fires the instant a *new* photo is acquired (before any
  // crop screen is shown), not after recipe #1's OCR succeeds (Phase 2C-1's
  // original timing). Moved earlier so the same call can also seed recipe
  // #1's own crop screen, not just recipe #2+'s "Crop Another" cycle — this
  // single call now serves both. Never fires for a "crop another" re-entry
  // (PhotoCaptureCrop only calls its onPhotoSelected for a genuine new
  // acquisition — see its own comment), so no "same photo as before" guard
  // is needed here the way Phase 2C-1's version needed one.
  function handlePhotoSelected(dataUrl: string) {
    setDetectedBoxes([])
    setActiveCropBox(undefined)
    void runBoundaryDetection(dataUrl)
  }

  // Fires once per new source photo, from handlePhotoSelected above (not
  // from inside RecipeImportModal, which stays mounted through capture/crop/
  // preview/OCR but still unmounts before a later "Crop Another" cycle would
  // need this same result — CookbookPage, the component whose lifetime
  // already spans the whole review+save+"crop another" cycle, is the only
  // place that can safely own it). A silent, best-effort suggestion: any
  // failure already resolves to an empty array inside detectRecipeBoxes, so
  // there's nothing to catch or surface here.
  async function runBoundaryDetection(sourcePhotoDataUrl: string) {
    detectionPhotoRef.current = sourcePhotoDataUrl
    const geminiKey = effectivePhotoGeminiKey(settings)
    if (!geminiKey) return
    const commaIdx = sourcePhotoDataUrl.indexOf(',')
    const base64 = sourcePhotoDataUrl.slice(commaIdx + 1)
    const mimeMatch = sourcePhotoDataUrl.slice(0, commaIdx).match(/data:(.*);base64/)
    const mimeType = mimeMatch?.[1] || 'image/jpeg'
    const boxes = await detectRecipeBoxes(base64, mimeType, geminiKey, settings.geminiModel)
    // A later photo selection (e.g. Back, then a different photo) may have
    // superseded this in-flight call — discard a stale result rather than
    // overwrite the newer photo's boxes.
    if (detectionPhotoRef.current !== sourcePhotoDataUrl) return
    // Bug fix: the deployed model reliably returns these on a 0-1000 scale,
    // not the requested 0-100 — normalized here, once, at the response level
    // (the only point where the full box list for this photo exists together;
    // see normalizeDetectionResponse's own comment for why this can't be done
    // per-box, later, inside PhotoCaptureCrop). Produces one array slot per
    // detected box, `null` where that specific box couldn't be resolved to a
    // sane box — index 0 consumed opportunistically below for recipe #1,
    // every later index consumed one at a time by handleCropAnother.
    setDetectedBoxes(normalizeDetectionResponse(boxes))
  }

  // Phase 2C-2 — opportunistically hands a detected box to whichever crop
  // screen is currently open, the instant one becomes available, unless
  // something has already claimed a box for it (`activeCropBox` already
  // set). This is what seeds recipe #1's own crop screen (which has no other
  // way to receive a box, since nothing calls handleCropAnother for it) and
  // — only in the rare case where detection was still in flight when
  // handleCropAnother's own synchronous consumption ran and found the queue
  // still empty — also covers a "Crop Another" cycle that opened before its
  // box was ready. PhotoCaptureCrop's own interaction-race guard (never
  // overwrite a crop the user already touched) is what makes handing this
  // down as `initialCropBox` at any point — including well after the crop
  // screen first mounted — safe.
  useEffect(() => {
    if (!showImport) return
    if (activeCropBox !== undefined) return
    if (detectedBoxes.length === 0) return
    setActiveCropBox(detectedBoxes[0] ?? undefined)
    setDetectedBoxes(boxes => boxes.slice(1))
  }, [detectedBoxes, showImport, activeCropBox])

  function handleManualWithReference(text: string) {
    setShowImport(false)
    setReferenceText(text)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setImportSourcePhoto(null)
    setDetectedBoxes([])
    setActiveCropBox(undefined)
    setEditingRecipe('new')
  }

  function handleManualEntry() {
    setShowImport(false)
    setImportPrefill(null)
    setImportNotice(undefined)
    setImportUncertainFields(undefined)
    setImportSourcePhoto(null)
    setDetectedBoxes([])
    setActiveCropBox(undefined)
    setEditingRecipe('new')
  }

  function handleCropAnother() {
    setShowCropAnotherOffer(false)
    // Hand the next unused suggested box (if any) to the reopened modal, and
    // consume it from the queue so it isn't offered again on a later cycle.
    // `detectedBoxes` may still be empty here (detection hasn't resolved yet,
    // or never found anything) — activeCropBox then stays undefined, which
    // is exactly "no preset crop," today's existing default. A `null` entry
    // (a box normalizeDetectionResponse couldn't resolve to a sane box) is
    // converted to undefined the same way, without disturbing the other
    // still-queued boxes.
    setActiveCropBox(detectedBoxes[0] ?? undefined)
    setDetectedBoxes(boxes => boxes.slice(1))
    setShowImport(true) // importSourcePhoto stays set — passed back in as initialPhotoDataUrl below
  }

  function handleDoneWithPhoto() {
    setShowCropAnotherOffer(false)
    setImportSourcePhoto(null)
    setDetectedBoxes([])
    setActiveCropBox(undefined)
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
    await deleteReference(ref.id)
    setViewingReference(null)
    await load()
    setPendingDelete(null)
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
          onDelete={ref => setPendingDelete({ kind: 'reference', item: ref })}
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
              onDelete={() => setPendingDelete({ kind: 'recipe', item: recipe })}
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
          onPhotoSelected={handlePhotoSelected}
          onClose={() => {
            setShowImport(false)
            // Closing the modal outright (not via a completed import) is
            // also "the user's next choice" resolving — clears a
            // crop-another photo rather than letting it silently reappear
            // pre-seeded into some unrelated later import.
            setImportSourcePhoto(null)
            setDetectedBoxes([])
            setActiveCropBox(undefined)
          }}
          initialPhotoDataUrl={importSourcePhoto ?? undefined}
          initialCropBox={activeCropBox}
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
            setDetectedBoxes([])
            setActiveCropBox(undefined)
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

      {/* ── Delete confirmation (recipe or reference, shared) ── */}
      {pendingDelete && (
        <Modal
          open
          onClose={() => setPendingDelete(null)}
          title={pendingDelete.kind === 'recipe' ? 'Delete Recipe' : 'Delete Reference'}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => pendingDelete.kind === 'recipe' ? handleDelete(pendingDelete.item) : handleDeleteReference(pendingDelete.item)}
              >
                Delete
              </Button>
            </>
          }
        >
          <p>Delete "{pendingDelete.kind === 'recipe' ? pendingDelete.item.name : pendingDelete.item.title}"? This cannot be undone.</p>
        </Modal>
      )}

      {/* ── Detail view ── */}
      {viewingRecipe && (
        <RecipeDetail
          recipe={viewingRecipe}
          allIngredients={allIngredients}
          onEdit={() => openEdit(viewingRecipe)}
          onClose={() => setViewingRecipe(null)}
          onToggleFavorite={() => handleToggleFavorite(viewingRecipe)}
          onDelete={() => setPendingDelete({ kind: 'recipe', item: viewingRecipe })}
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
          onDelete={() => setPendingDelete({ kind: 'reference', item: viewingReference })}
          onClose={() => setViewingReference(null)}
        />
      )}

      <Modal open={showCalculator} onClose={() => setShowCalculator(false)} title="Conversion Calculator" size="sm">
        <ConversionCalculator />
      </Modal>
    </div>
  )
}
