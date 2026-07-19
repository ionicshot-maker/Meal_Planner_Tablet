import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Heart, Pencil, Trash2, X, Printer, Clock } from 'lucide-react'
import { buildIngredientMap, calcRecipeMacros, calcRecipeCost, scaleIngredients, formatMacro } from '@/utils/recipeCalculations'
import { getRecipeAllergens, getRecipeNovaAverage } from '@/utils/ingredientQuality'
import { formatMinutes, formatQuantity } from '@/utils/units'
import { NutriscoreBadge, NovaBadge } from '@/components/QualityBadges'
import { AllergenBadgeList } from '@/components/AllergenChips'
import type { Recipe, Ingredient } from '@/types'
import styles from './RecipeDetail.module.css'

interface Props {
  recipe: Recipe
  allIngredients: Ingredient[]
  onEdit: () => void
  onClose: () => void
  onToggleFavorite: () => void
  onDelete: () => void
  onAddToMealPlan?: () => void
}

export function RecipeDetail({ recipe, allIngredients, onEdit, onClose, onToggleFavorite, onDelete, onAddToMealPlan }: Props) {
  const [scale, setScale] = useState(1)

  const ingredientMap = buildIngredientMap(allIngredients)
  const scaledIngredients = scaleIngredients(recipe.ingredients, scale)
  const hasUnlinked = recipe.ingredients.some(ri => !ri.ingredientId)
  const macros = calcRecipeMacros(scaledIngredients, ingredientMap, recipe.servings)
  const cost   = calcRecipeCost(scaledIngredients, ingredientMap, recipe.servings)
  const allergens = getRecipeAllergens(recipe.ingredients, ingredientMap)
  const novaAverage = getRecipeNovaAverage(recipe.ingredients, ingredientMap)

  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes
  const scaledServings = Math.round(recipe.servings * scale)

  const scaleOptions = [
    { label: '½×', value: 0.5 },
    { label: '1×', value: 1 },
    { label: '1.5×', value: 1.5 },
    { label: '2×', value: 2 },
    { label: '3×', value: 3 },
  ]

  function printRecipe() {
    const w = window.open('', '_blank')
    if (!w) return
    const rows = scaledIngredients.map(ri => {
      const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
      const displayName = ing?.name ?? ri.name
      const qty = ri.servingDisplay ?? formatQuantity(ri.quantity, ri.unit)
      return `<li><span class="qty">${qty}</span>${displayName}</li>`
    }).join('')
    const steps = recipe.steps.slice().sort((a, b) => a.order - b.order)
      .map(s => `<li>${s.text}</li>`).join('')
    const macroLine = macros.calories > 0
      ? `<div class="macros">Per serving: <strong>${Math.round(macros.calories)}</strong> cal &middot; <strong>${formatMacro(macros.protein)}</strong>g protein &middot; <strong>${formatMacro(macros.carbs)}</strong>g carbs &middot; <strong>${formatMacro(macros.fat)}</strong>g fat${cost != null ? ` &middot; <strong>$${cost.toFixed(2)}</strong>/serving` : ''}</div>`
      : ''
    w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${recipe.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111;padding:24px;max-width:700px;margin:0 auto}
  h1{font-size:18pt;font-weight:bold;margin-bottom:6px}
  h2{font-size:12pt;font-weight:bold;margin:16px 0 8px;border-bottom:1px solid #ddd;padding-bottom:3px}
  .meta{font-size:9pt;color:#666;margin-bottom:10px}
  .tags{margin-bottom:6px}
  .tag{display:inline-block;font-size:8pt;background:#e8ddc8;padding:2px 8px;border-radius:10px;margin-right:4px}
  .macros{font-size:9.5pt;color:#444;background:#faf4e8;padding:8px 12px;border-radius:5px;margin-bottom:14px}
  ul.ings{list-style:none;margin:0}
  ul.ings li{padding:3px 0;font-size:10.5pt}
  .qty{display:inline-block;min-width:90px;color:#666;font-size:9.5pt}
  ol.steps{margin-left:18px}
  ol.steps li{margin-bottom:8px;font-size:10.5pt;line-height:1.5}
  .notes{font-style:italic;color:#555;background:#faf4e8;padding:8px 12px;border-radius:5px;font-size:10pt}
  @media print{body{padding:12px}h2{break-before:auto}}
</style></head><body>
<h1>${recipe.name}</h1>
${recipe.tags.length ? `<div class="tags">${recipe.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
<div class="meta">${scaledServings} serving${scaledServings !== 1 ? 's' : ''}${scale !== 1 ? ` (${scale}× scale)` : ''}${recipe.prepTimeMinutes > 0 ? ` &nbsp;&middot;&nbsp; Prep: ${formatMinutes(recipe.prepTimeMinutes)}` : ''}${recipe.cookTimeMinutes > 0 ? ` &nbsp;&middot;&nbsp; Cook: ${formatMinutes(recipe.cookTimeMinutes)}` : ''}${recipe.sourceName ? ` &nbsp;&middot;&nbsp; Source: ${recipe.sourceName}` : ''}</div>
${macroLine}
${scaledIngredients.length > 0 ? `<h2>Ingredients</h2><ul class="ings">${rows}</ul>` : ''}
${recipe.steps.length > 0 ? `<h2>Instructions</h2><ol class="steps">${steps}</ol>` : ''}
${recipe.notes ? `<h2>Notes</h2><div class="notes">${recipe.notes}</div>` : ''}
</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 200)
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={recipe.name}>
      <div className={styles.panel}>

        {/* Photo banner */}
        {recipe.photoUrl && (
          <div className={styles.photoBanner}>
            <img src={recipe.photoUrl} alt={recipe.name} className={styles.photo} />
          </div>
        )}

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>{recipe.name}</h1>
            {recipe.isTemplate && <span className={styles.templateBadge}>Template</span>}
            {recipe.tags.length > 0 && (
              <div className={styles.tags}>
                {recipe.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            )}
          </div>
          <div className={styles.headerActions}>
            <button
              className={`${styles.favBtn} ${recipe.isFavorite ? styles.favActive : ''}`}
              onClick={onToggleFavorite}
              title={recipe.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={18} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button className={styles.iconBtn} onClick={onEdit} title="Edit"><Pencil size={16} /></button>
            <button className={styles.iconBtnDanger} onClick={onDelete} title="Delete"><Trash2 size={16} /></button>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>

        {/* Meta row */}
        <div className={styles.metaRow}>
          {totalTime > 0 && (
            <span className={styles.metaItem} title="Total time"><Clock size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />{formatMinutes(totalTime)}</span>
          )}
          {recipe.prepTimeMinutes > 0 && (
            <span className={styles.metaItem}>Prep: {formatMinutes(recipe.prepTimeMinutes)}</span>
          )}
          {recipe.cookTimeMinutes > 0 && (
            <span className={styles.metaItem}>Cook: {formatMinutes(recipe.cookTimeMinutes)}</span>
          )}
          {(recipe.sourceUrl || recipe.sourceName) && (
            <span className={styles.metaItem}>
              Source: {recipe.sourceUrl
                ? <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>{recipe.sourceName || recipe.sourceUrl}</a>
                : recipe.sourceName}
            </span>
          )}
        </div>

        {/* Scale controls */}
        <div className={styles.scaleBar}>
          <span className={styles.scaleLabel}>Scale:</span>
          <div className={styles.scaleButtons}>
            {scaleOptions.map(opt => (
              <button
                key={opt.value}
                className={`${styles.scaleBtn} ${scale === opt.value ? styles.scaleBtnActive : ''}`}
                onClick={() => setScale(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className={styles.scaledServings}>{scaledServings} serving{scaledServings !== 1 ? 's' : ''}</span>
        </div>

        {/* Macro bar */}
        {macros.calories > 0 && (
          <div className={styles.macroBar}>
            <span className={styles.macroItem}><strong>{Math.round(macros.calories)}</strong> cal</span>
            <span className={styles.macroDot}>·</span>
            <span className={styles.macroItem}><strong>{formatMacro(macros.protein)}</strong>g P</span>
            <span className={styles.macroDot}>·</span>
            <span className={styles.macroItem}><strong>{formatMacro(macros.carbs)}</strong>g C</span>
            <span className={styles.macroDot}>·</span>
            <span className={styles.macroItem}><strong>{formatMacro(macros.fat)}</strong>g F</span>
            {macros.fiber > 0 && <>
              <span className={styles.macroDot}>·</span>
              <span className={styles.macroItem}><strong>{formatMacro(macros.fiber)}</strong>g fiber</span>
            </>}
            {cost != null && <>
              <span className={styles.macroDot}>·</span>
              <span className={styles.macroItem}><strong>${cost.toFixed(2)}</strong>/sv</span>
            </>}
            <span className={styles.macroMeta}>per serving</span>
          </div>
        )}

        {/* Quality: average Nova level + consolidated allergens */}
        {(novaAverage || allergens.length > 0) && (
          <div className={styles.qualityBar}>
            {novaAverage && (
              <span className={styles.qualityItem}>
                Avg. processing: <NovaBadge group={novaAverage} showInfo />
              </span>
            )}
            {allergens.length > 0 && (
              <span className={styles.qualityItem}>
                Allergens: <AllergenBadgeList allergens={allergens} />
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>

          {/* Ingredients */}
          {scaledIngredients.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Ingredients</h2>
              {hasUnlinked && (
                <div className={styles.unlinkedNotice}>
                  Nutritional information may be incomplete — some ingredients are not linked to your ingredient database and their macros are not included in the totals.
                </div>
              )}
              <ul className={styles.ingList}>
                {scaledIngredients.map((ri, idx) => {
                  const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
                  const variant = ing?.variants.find(v => v.id === ri.variantId) ?? ing?.variants[0]
                  const displayName = ing?.name ?? ri.name
                  const brandLabel = variant && variant.brand && variant.brand !== displayName
                    ? ` (${variant.brand})`
                    : ''
                  return (
                    <li key={idx} className={styles.ingItem}>
                      <span className={styles.ingQty}>
                        {ri.servingDisplay
                          ? ri.servingDisplay
                          : formatQuantity(ri.quantity, ri.unit)
                        }
                      </span>
                      <span className={styles.ingName}>{displayName}{brandLabel}</span>
                      {variant?.nutriscore && <NutriscoreBadge grade={variant.nutriscore} />}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Instructions */}
          {recipe.steps.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Instructions</h2>
              <ol className={styles.stepsList}>
                {recipe.steps
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((step, idx) => (
                    <li key={step.id} className={styles.step}>
                      <span className={styles.stepNum}>{idx + 1}</span>
                      <p className={styles.stepText}>{step.text}</p>
                    </li>
                  ))}
              </ol>
            </section>
          )}

          {/* Notes */}
          {recipe.notes && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Notes</h2>
              <p className={styles.notes}>{recipe.notes}</p>
            </section>
          )}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          {onAddToMealPlan && !recipe.isTemplate && (
            <button className={styles.btnSecondary} onClick={onAddToMealPlan}>+ Add to Plan</button>
          )}
          <button className={styles.btnSecondary} onClick={printRecipe}><Printer size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />Print</button>
          <button className={styles.btnSecondary} onClick={onEdit}>Edit Recipe</button>
          <button className={styles.btnPrimary} onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
