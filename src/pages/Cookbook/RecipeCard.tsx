import type { Recipe } from '@/types'
import { formatMacro } from '@/utils/recipeCalculations'
import { formatMinutes } from '@/utils/units'
import styles from './RecipeCard.module.css'

interface Props {
  recipe: Recipe
  onView: () => void
  onEdit: () => void
  onToggleFavorite: () => void
  onSaveAsTemplate: () => void
  onDelete: () => void
  onUseTemplate?: () => void
  onAddToMealPlan?: () => void
}

export function RecipeCard({ recipe, onView, onEdit, onToggleFavorite, onSaveAsTemplate, onDelete, onUseTemplate, onAddToMealPlan }: Props) {
  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes
  const m = recipe.macrosPerServing
  const hasUnlinked = recipe.ingredients.some(ri => !ri.ingredientId)

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
          <button
            className={`${styles.favBtn} ${recipe.isFavorite ? styles.favActive : ''}`}
            onClick={onToggleFavorite}
            aria-label={recipe.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {recipe.isFavorite ? '♥' : '♡'}
          </button>
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
              ⏱ {formatMinutes(totalTime)}
            </span>
          )}
          <span className={styles.stat}>{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</span>
          {recipe.estimatedCostPerServing != null && (
            <span className={styles.stat} title="Estimated cost per serving">
              ${recipe.estimatedCostPerServing.toFixed(2)}/sv
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

