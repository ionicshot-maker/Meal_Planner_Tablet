import type { RecipeStatus } from '@/utils/recipeStatus'
import styles from './RecipeStatusRow.module.css'

interface Props {
  status: RecipeStatus
  verifiedServingCount: boolean
  onJumpToIngredients?: () => void
  onJumpToPricing?: () => void
  onJumpToServings?: () => void
}

// Compact, informational-only status row — no popups. Warning chips are
// clickable when a jump target is provided (scrolls/highlights the relevant
// section); everything else is just a plain read-only indicator.
export function RecipeStatusRow({ status, verifiedServingCount, onJumpToIngredients, onJumpToPricing, onJumpToServings }: Props) {
  if (status.totalIngredients === 0) return null

  return (
    <div className={styles.row}>
      {status.allLinked ? (
        <span className={`${styles.chip} ${styles.ok}`}>✅ Ingredients Linked</span>
      ) : (
        <button type="button" className={`${styles.chip} ${styles.warn}`} onClick={onJumpToIngredients}>
          ⚠️ {status.unlinkedCount} Unlinked Ingredient{status.unlinkedCount !== 1 ? 's' : ''}
        </button>
      )}

      {status.nutritionComplete && (
        <span className={`${styles.chip} ${styles.ok}`}>✅ Nutrition Complete</span>
      )}

      {status.pricingComplete ? (
        <span className={`${styles.chip} ${styles.ok}`}>✅ Pricing Complete</span>
      ) : status.linkedCount > 0 && status.missingPricingCount > 0 ? (
        <button type="button" className={`${styles.chip} ${styles.warn}`} onClick={onJumpToPricing}>
          ⚠️ Missing Pricing for {status.missingPricingCount} Ingredient{status.missingPricingCount !== 1 ? 's' : ''}
        </button>
      ) : null}

      {verifiedServingCount ? (
        <span className={`${styles.chip} ${styles.ok}`}>✅ Serving Count Verified</span>
      ) : (
        <button type="button" className={`${styles.chip} ${styles.warn}`} onClick={onJumpToServings}>
          ⚠️ Serving Count Not Verified
        </button>
      )}
    </div>
  )
}
