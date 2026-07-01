import { useState } from 'react'
import { ArrowLeft, ArrowUp, ArrowDown, X, Printer } from 'lucide-react'
import { formatMinutes } from '@/utils/units'
import { formatMacro } from '@/utils/recipeCalculations'
import type { Recipe, RecipeCollection } from '@/types'
import { CollectionPDFExport } from './CollectionPDFExport'
import styles from './CollectionView.module.css'

interface Props {
  collection: RecipeCollection
  recipes: Recipe[]
  onBack: () => void
  onSave: (c: RecipeCollection) => Promise<void>
  onViewRecipe: (recipe: Recipe) => void
}

export function CollectionView({ collection, recipes, onBack, onSave, onViewRecipe }: Props) {
  const [showExport, setShowExport] = useState(false)

  const recipeMap = new Map(recipes.map(r => [r.id, r]))
  const collectionRecipes = collection.recipeIds
    .map(id => recipeMap.get(id))
    .filter((r): r is Recipe => !!r)

  async function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...collection.recipeIds]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    await onSave({ ...collection, recipeIds: next })
  }

  async function moveDown(idx: number) {
    if (idx === collection.recipeIds.length - 1) return
    const next = [...collection.recipeIds]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    await onSave({ ...collection, recipeIds: next })
  }

  async function removeRecipe(recipeId: string) {
    await onSave({ ...collection, recipeIds: collection.recipeIds.filter(id => id !== recipeId) })
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />Back
        </button>
        <h2 className={styles.title}>{collection.name}</h2>
        <button className={styles.exportBtn} onClick={() => setShowExport(true)}>
          <Printer size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />Export PDF
        </button>
      </div>

      {collectionRecipes.length === 0 ? (
        <div className={styles.empty}>
          No recipes in this collection yet. Use the <strong>folder+</strong> icon on any recipe card to add one.
        </div>
      ) : (
        <div className={styles.list}>
          {collectionRecipes.map((recipe, idx) => {
            const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes
            const m = recipe.macrosPerServing
            return (
              <div key={recipe.id} className={styles.row}>
                <div className={styles.reorderBtns}>
                  <button
                    className={styles.reorderBtn}
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className={styles.reorderBtn}
                    onClick={() => moveDown(idx)}
                    disabled={idx === collectionRecipes.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                {recipe.photoUrl && (
                  <img src={recipe.photoUrl} alt="" className={styles.thumb} />
                )}
                <div className={styles.info}>
                  <button className={styles.nameBtn} onClick={() => onViewRecipe(recipe)}>
                    {recipe.name}
                  </button>
                  <div className={styles.meta}>
                    {totalTime > 0 && <span>{formatMinutes(totalTime)}</span>}
                    <span>{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</span>
                    {m && m.calories > 0 && (
                      <span>{Math.round(m.calories)} cal · {formatMacro(m.protein)}g P · {formatMacro(m.carbs)}g C · {formatMacro(m.fat)}g F</span>
                    )}
                  </div>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeRecipe(recipe.id)}
                  aria-label="Remove from collection"
                  title="Remove from collection"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showExport && (
        <CollectionPDFExport
          collection={collection}
          recipes={collectionRecipes}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
