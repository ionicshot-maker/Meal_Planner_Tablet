import { Heart, Clock, FolderPlus } from 'lucide-react'
import type { Recipe, RecipeCollection, Ingredient } from '@/types'
import { formatMacro, buildIngredientMap } from '@/utils/recipeCalculations'
import { getRecipeAllergens } from '@/utils/ingredientQuality'
import { getRecipeStatus, formatPriceDate } from '@/utils/recipeStatus'
import { AllergenBadgeList } from '@/components/AllergenChips'
import { formatMinutes } from '@/utils/units'
import styles from './RecipeCard.module.css'

interface Props {
  recipe: Recipe
  collections: RecipeCollection[]
  allIngredients: Ingredient[]
  onView: () => void
  onEdit: () => void
  onToggleFavorite: () => void
  onSaveAsTemplate: () => void
  onDelete: () => void
  onUseTemplate?: () => void
  onAddToMealPlan?: () => void
  onAddToCollection: (collectionId: string) => void
  onCreateCollection: (name: string) => void
}

export function RecipeCard({ recipe, collections, allIngredients, onView, onEdit, onToggleFavorite, onSaveAsTemplate, onDelete, onUseTemplate, onAddToMealPlan, onAddToCollection, onCreateCollection }: Props) {
  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes
  const m = recipe.macrosPerServing
  const hasUnlinked = recipe.ingredients.some(ri => !ri.ingredientId)
  const ingredientMap = buildIngredientMap(allIngredients)
  const allergens = getRecipeAllergens(recipe.ingredients, ingredientMap)
  const status = getRecipeStatus(recipe.ingredients, ingredientMap)
  const displayCost = status.pricingComplete ? recipe.estimatedCostPerServing : null

  function handleCollectionClick() {
    if (collections.length === 0) {
      const name = prompt('New collection name:')
      if (name?.trim()) onCreateCollection(name.trim())
    } else {
      const names = collections.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
      const input = prompt(`Add to collection:\n${names}\n\nEnter number or type a new name:`)
      if (!input?.trim()) return
      const idx = parseInt(input.trim()) - 1
      if (!isNaN(idx) && collections[idx]) {
        onAddToCollection(collections[idx].id)
      } else {
        onCreateCollection(input.trim())
      }
    }
  }

  return (
    <article className={`${styles.card} ${recipe.isTemplate ? styles.isTemplate : ''}`}>
      {/* Photo */}
      {recipe.photoUrl && (
        <button className={styles.photoBtn} onClick={onView} aria-label="View recipe">
          <img src={recipe.photoUrl} alt={recipe.name} className={styles.photo} />
        </button>
      )}

      <div className={styles.body}>
        {/* Header row */}
        <div className={styles.header}>
          <button className={styles.nameBtn} onClick={onView}>
            <h2 className={styles.name}>{recipe.name}</h2>
          </button>
          <div className={styles.headerIcons}>
            <button
              className={`${styles.favBtn} ${recipe.isFavorite ? styles.favActive : ''}`}
              onClick={onToggleFavorite}
              aria-label={recipe.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={16} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
            </button>
            {!recipe.isTemplate && (
              <button
                className={styles.collectionBtn}
                onClick={handleCollectionClick}
                aria-label="Add to collection"
                title="Add to collection"
              >
                <FolderPlus size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Template badge */}
        {recipe.isTemplate && <div className={styles.templateBadge}>Template</div>}

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className={styles.tags}>
            {recipe.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          </div>
        )}

        {/* Stats row */}
        <div className={styles.stats}>
          {totalTime > 0 && (
            <span className={styles.stat} title="Total time">
              <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 2 }} />{formatMinutes(totalTime)}
            </span>
          )}
          <span className={styles.stat}>{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</span>
          {displayCost != null && (
            <span className={styles.stat} title="Estimated cost per serving">
              ${displayCost.toFixed(2)}/sv
            </span>
          )}
        </div>

        {/* Pricing + serving-count trust indicators */}
        <div className={styles.trustRow}>
          {status.pricingComplete
            ? status.latestPriceUpdate && (
                <span className={styles.trustMuted}>Prices Last Updated: {formatPriceDate(status.latestPriceUpdate)}</span>
              )
            : status.linkedCount > 0 && status.missingPricingCount > 0 && (
                <span className={styles.trustWarning}>
                  ⚠️ Missing pricing for {status.missingPricingCount} ingredient{status.missingPricingCount !== 1 ? 's' : ''}
                </span>
              )
          }
          {recipe.verifiedServingCount ? (
            <span className={styles.trustOk}>✓ Verified</span>
          ) : (
            <span className={styles.trustWarning}>
              ⚠️ Serving count not verified — per-serving nutrition may be inaccurate
            </span>
          )}
        </div>

        {/* Macro bar */}
        {m && (
          <div className={`${styles.macros} ${hasUnlinked ? styles.macrosIncomplete : ''}`}>
            <span className={styles.macro}><strong>{Math.round(m.calories)}</strong> cal</span>
            <span className={styles.macroDot}>·</span>
            <span className={styles.macro}><strong>{formatMacro(m.protein)}</strong>g P</span>
            <span className={styles.macroDot}>·</span>
            <span className={styles.macro}><strong>{formatMacro(m.carbs)}</strong>g C</span>
            <span className={styles.macroDot}>·</span>
            <span className={styles.macro}><strong>{formatMacro(m.fat)}</strong>g F</span>
            {hasUnlinked && (
              <span className={styles.incompleteLabel}>Incomplete — missing ingredients</span>
            )}
          </div>
        )}

        {/* Allergens */}
        {allergens.length > 0 && (
          <div className={styles.allergenRow}>
            <AllergenBadgeList allergens={allergens} />
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {recipe.isTemplate
            ? <button className={styles.btnPrimary} onClick={onUseTemplate}>Use Template</button>
            : <button className={styles.btnPrimary} onClick={onView}>View</button>
          }
          <button className={styles.btnSecondary} onClick={onEdit}>Edit</button>
          <div className={styles.moreActions}>
            {!recipe.isTemplate && onAddToMealPlan && (
              <button className={styles.moreBtn} onClick={onAddToMealPlan}>+ Plan</button>
            )}
            {!recipe.isTemplate && (
              <button className={styles.moreBtn} onClick={onSaveAsTemplate}>Template</button>
            )}
            <button className={`${styles.moreBtn} ${styles.danger}`} onClick={onDelete}>Delete</button>
          </div>
        </div>
      </div>
    </article>
  )
}
