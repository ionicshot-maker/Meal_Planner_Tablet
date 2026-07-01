import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings, useHouseholdTitle } from '@/context/SettingsContext'
import { Button, Input, Select, Card, Modal, Toggle } from '@/components/ui'
import { getAllIngredients, saveIngredient, archiveIngredient, deleteIngredient, searchIngredients } from '@/db/ingredients'
import { newId, now } from '@/utils/ids'
import { IngredientForm } from './IngredientForm'
import type { Ingredient } from '@/types'
import styles from './IngredientsPage.module.css'

export default function IngredientsPage() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const pageTitle = useHouseholdTitle('Ingredient Database')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
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

  const filtered = filterCategory
    ? ingredients.filter(i => i.category === filterCategory)
    : ingredients

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
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => navigate('/import-ingredients')}>📥 Import</Button>
          <Button onClick={createNew}>+ Add Ingredient</Button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <Input
          placeholder="Search ingredients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.search}
        />
        <Select
          options={categoryOptions}
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className={styles.categoryFilter}
        />
        <Toggle
          label="Show archived"
          checked={showArchived}
          onChange={setShowArchived}
        />
      </div>
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
            ℹ️ Pre-loaded ingredients use USDA average values for generic raw items. Nutritional values vary by variety,
            ripeness, and preparation — cooked weights differ from raw. Always verify against a food label for packaged products.
          </span>
          <button
            className={styles.infoBannerDismiss}
            onClick={() => { localStorage.setItem('starter_banner_dismissed', '1'); setBannerDismissed(true) }}
            aria-label="Dismiss"
          >✕</button>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          {search || filterCategory
            ? 'No ingredients match your filters.'
            : 'No ingredients yet. Add your first ingredient to get started.'}
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(ingredient => (
            <IngredientCard
              key={ingredient.id}
              ingredient={ingredient}
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
function IngredientCard({ ingredient, onEdit, onArchive, onDelete }: {
  ingredient: Ingredient
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
          </div>
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
