import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSettings, useHouseholdTitle } from '@/context/SettingsContext'
import { Button, Input, Select, Card, Modal, Toggle } from '@/components/ui'
import { Download, FileJson, Info, X, SlidersHorizontal } from 'lucide-react'
import { getAllIngredients, getIngredient, saveIngredient, archiveIngredient, deleteIngredient, searchIngredients } from '@/db/ingredients'
import { newId, now } from '@/utils/ids'
import { IngredientForm } from './IngredientForm'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import { NutriscoreBadge, NovaBadge } from '@/components/QualityBadges'
import { AllergenBadgeList, AllergenPicker } from '@/components/AllergenChips'
import { formatPriceDate } from '@/utils/recipeStatus'
import type { Ingredient, IngredientDisplayToggles } from '@/types'
import styles from './IngredientsPage.module.css'

const NUTRISCORE_FILTER_OPTIONS = [
  { value: '', label: 'Any grade' },
  { value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' },
  { value: 'D', label: 'D' }, { value: 'E', label: 'E' },
]

const NOVA_FILTER_OPTIONS = [
  { value: '', label: 'Any group' },
  { value: '1', label: '1 — Unprocessed' },
  { value: '2', label: '2 — Minimally Processed' },
  { value: '3', label: '3 — Processed' },
  { value: '4', label: '4 — Ultra Processed' },
]

export default function IngredientsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { settings } = useSettings()
  const pageTitle = useHouseholdTitle('Ingredient Database')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterNutriscore, setFilterNutriscore] = useState('')
  const [filterNova, setFilterNova] = useState('')
  const [filterAllergenContains, setFilterAllergenContains] = useState<string[]>([])
  const [filterAllergenExcludes, setFilterAllergenExcludes] = useState<string[]>([])
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Ingredient | null>(null)
  const [loading, setLoading] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('starter_banner_dismissed') === '1'
  )

  const load = useCallback(async () => {
    const results = search
      ? await searchIngredients(search, showArchived)
      : await getAllIngredients(showArchived)
    setIngredients(results)
    setLoading(false)
  }, [search, showArchived])

  useEffect(() => { load() }, [load])

  // Deep-link support: /ingredients?edit=<id> opens that ingredient's editor directly —
  // used when a barcode scan matches an ingredient already in the local database.
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    getIngredient(editId).then(ing => { if (ing) setEditing(ing) })
    setSearchParams(prev => { prev.delete('edit'); return prev }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasQualityFilters = filterNutriscore || filterNova || filterAllergenContains.length > 0 || filterAllergenExcludes.length > 0

  const filtered = ingredients.filter(i => {
    if (filterCategory && i.category !== filterCategory) return false
    if (!hasQualityFilters) return true
    if (filterNutriscore && !i.variants.some(v => v.nutriscore === filterNutriscore)) return false
    if (filterNova && !i.variants.some(v => String(v.novaGroup) === filterNova)) return false
    if (filterAllergenContains.length > 0 || filterAllergenExcludes.length > 0) {
      const allAllergens = new Set(i.variants.flatMap(v => v.allergens ?? []))
      if (filterAllergenContains.length > 0 && !filterAllergenContains.some(a => allAllergens.has(a))) return false
      if (filterAllergenExcludes.length > 0 && filterAllergenExcludes.some(a => allAllergens.has(a))) return false
    }
    return true
  })

  const activeFilterCount =
    (filterNutriscore ? 1 : 0) + (filterNova ? 1 : 0) + filterAllergenContains.length + filterAllergenExcludes.length

  function createNew() {
    const blank: Ingredient = {
      id: newId(),
      name: '',
      category: settings.ingredientCategories[0] ?? 'Pantry',
      perishable: false,
      frozen: false,
      alwaysOnHand: false,
      archived: false,
      variants: [],
      defaultVariantId: '',
      createdAt: now(),
      updatedAt: now(),
    }
    setEditing(blank)
  }

  async function handleSave(ingredient: Ingredient) {
    await saveIngredient(ingredient)
    await load()
    setEditing(null)
  }

  async function handleArchive(ingredient: Ingredient) {
    await archiveIngredient(ingredient.id)
    await load()
  }

  async function handleDelete(ingredient: Ingredient) {
    await deleteIngredient(ingredient.id)
    await load()
    setConfirmDelete(null)
  }

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...settings.ingredientCategories.map(c => ({ value: c, label: c })),
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{pageTitle}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => navigate('/import-ingredients')} title="Import"><Download size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} /><span className={styles.btnLabel}>Import</span></Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/import-ingredients?tab=jsonImport')} title="Import from JSON"><FileJson size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} /><span className={styles.btnLabel}>Import from JSON</span></Button>
          <Button onClick={createNew} title="Add Ingredient">+ <span className={styles.btnLabel}>Add Ingredient</span></Button>
          <PageHelpButton />
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <Input
            placeholder="Search ingredients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            wrapperClassName={styles.search}
          />
          <Select
            options={categoryOptions}
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            wrapperClassName={styles.categoryFilter}
          />
          <Button
            variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
            onClick={() => setShowMoreFilters(v => !v)}
          >
            <SlidersHorizontal size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>
        <Toggle
          label="Show archived"
          checked={showArchived}
          onChange={setShowArchived}
        />
      </div>

      {showMoreFilters && (
        <div className={styles.moreFiltersPanel}>
          <div className={styles.moreFiltersRow}>
            <div className={styles.moreFilterField}>
              <span className={styles.moreFilterLabel}>Nutriscore</span>
              <Select
                options={NUTRISCORE_FILTER_OPTIONS}
                value={filterNutriscore}
                onChange={e => setFilterNutriscore(e.target.value)}
              />
            </div>
            <div className={styles.moreFilterField}>
              <span className={styles.moreFilterLabel}>Nova Group</span>
              <Select
                options={NOVA_FILTER_OPTIONS}
                value={filterNova}
                onChange={e => setFilterNova(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.moreFilterField}>
            <span className={styles.moreFilterLabel}>Contains allergen</span>
            <AllergenPicker selected={filterAllergenContains} onChange={setFilterAllergenContains} />
          </div>
          <div className={styles.moreFilterField}>
            <span className={styles.moreFilterLabel}>Excludes allergen</span>
            <AllergenPicker selected={filterAllergenExcludes} onChange={setFilterAllergenExcludes} />
          </div>
          {activeFilterCount > 0 && (
            <button
              className={styles.clearFiltersBtn}
              onClick={() => { setFilterNutriscore(''); setFilterNova(''); setFilterAllergenContains([]); setFilterAllergenExcludes([]) }}
            >
              Clear quality filters
            </button>
          )}
        </div>
      )}
      <div className={styles.quickFilters}>
        {['Beverages', 'Meat', 'Produce', 'Dairy', 'Pantry', 'Frozen', 'Snacks'].map(cat => (
          settings.ingredientCategories.includes(cat) ? (
            <button
              key={cat}
              className={`${styles.quickFilter} ${filterCategory === cat ? styles.quickFilterActive : ''}`}
              onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
            >
              {cat}
            </button>
          ) : null
        ))}
      </div>

      {settings.starterLibrarySeeded && !bannerDismissed && (
        <div className={styles.infoBanner}>
          <span className={styles.infoBannerText}>
            <strong><Info size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Pre-loaded ingredients use USDA average values for generic raw items.</strong>{' '}
            Nutritional values vary by variety, ripeness, and preparation — cooked weights differ from raw.
            Always verify against a food label for packaged products.
          </span>
          <button
            className={styles.infoBannerDismiss}
            onClick={() => { localStorage.setItem('starter_banner_dismissed', '1'); setBannerDismissed(true) }}
            aria-label="Dismiss"
          ><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          {search || filterCategory || hasQualityFilters
            ? 'No ingredients match your filters.'
            : 'No ingredients yet. Add your first ingredient to get started.'}
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(ingredient => (
            <IngredientCard
              key={ingredient.id}
              ingredient={ingredient}
              display={settings.ingredientDisplay}
              onEdit={() => setEditing(ingredient)}
              onArchive={() => handleArchive(ingredient)}
              onDelete={() => setConfirmDelete(ingredient)}
            />
          ))}
        </div>
      )}

      {editing && (
        <IngredientForm
          ingredient={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title="Delete Ingredient"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>Delete Permanently</Button>
            </>
          }
        >
          <p>
            Permanently delete <strong>{confirmDelete.name}</strong>? This cannot be undone.
            Consider archiving instead to preserve it in existing recipes.
          </p>
        </Modal>
      )}
    </div>
  )
}

// ─── Ingredient card ──────────────────────────────────────────────────────────
function IngredientCard({ ingredient, display, onEdit, onArchive, onDelete }: {
  ingredient: Ingredient
  display: IngredientDisplayToggles
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const defaultVariant = ingredient.variants.find(v => v.id === ingredient.defaultVariantId)
    ?? ingredient.variants[0]

  return (
    <Card padding="sm" className={`${styles.card} ${ingredient.archived ? styles.archived : ''}`}>
      <div className={styles.cardMain}>
        <div className={styles.cardInfo}>
          <div className={styles.cardName}>
            {ingredient.name}
            {ingredient.archived && <span className={styles.archivedBadge}>Archived</span>}
            {ingredient.alwaysOnHand && <span className={styles.badge} title="Always on hand">✓</span>}
            {display.showNutriscore && <NutriscoreBadge grade={defaultVariant?.nutriscore} showInfo />}
            {display.showNovaGroup && <NovaBadge group={defaultVariant?.novaGroup} showInfo />}
          </div>
          <div className={styles.cardMeta}>
            <span>{ingredient.category}</span>
            {ingredient.variants.length > 0 && (
              <span>{ingredient.variants.length} brand{ingredient.variants.length !== 1 ? 's' : ''}</span>
            )}
            {defaultVariant && (
              <span>{defaultVariant.macros.calories} cal / serving</span>
            )}
            {ingredient.perishable && (
              <span>{ingredient.frozen ? '❄️ Frozen' : '🥬 Perishable'}</span>
            )}
            {defaultVariant?.barcode && (
              <span className={styles.barcodeText}>#{defaultVariant.barcode}</span>
            )}
            {defaultVariant?.priceLastUpdated && (
              <span className={styles.barcodeText}>Price Last Updated: {formatPriceDate(defaultVariant.priceLastUpdated)}</span>
            )}
          </div>
          {display.showAllergens && defaultVariant?.allergens && defaultVariant.allergens.length > 0 && (
            <AllergenBadgeList allergens={defaultVariant.allergens} />
          )}
        </div>

        <div className={styles.cardActions}>
          <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>
          {!ingredient.archived && (
            <Button size="sm" variant="ghost" onClick={onArchive}>Archive</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      {ingredient.variants.length > 1 && (
        <div className={styles.variants}>
          {ingredient.variants.map(v => (
            <span key={v.id} className={`${styles.variantChip} ${v.id === ingredient.defaultVariantId ? styles.defaultVariant : ''}`}>
              {v.brand}
              {v.costPerServing != null && ` · $${v.costPerServing.toFixed(2)}/sv`}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
