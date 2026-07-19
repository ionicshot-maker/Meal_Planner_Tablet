import type { RecipeIngredient, Ingredient, IngredientVariant } from '@/types'

export interface RecipeStatus {
  totalIngredients: number
  linkedCount: number
  unlinkedCount: number
  allLinked: boolean
  nutritionCompleteCount: number
  nutritionComplete: boolean
  missingPricingCount: number
  pricingComplete: boolean
  latestPriceUpdate: string | null
}

function resolveVariant(ri: RecipeIngredient, ingredientMap: Map<string, Ingredient>): IngredientVariant | undefined {
  const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
  if (!ing) return undefined
  return ing.variants.find(v => v.id === ri.variantId) ?? ing.variants[0]
}

// Same all-zero heuristic already used elsewhere in the app (BarcodeTab, IngredientImportPage)
// to flag nutrition data that was never filled in versus a legitimately zero-calorie item.
function hasNutritionData(variant: IngredientVariant): boolean {
  const m = variant.macros
  return !((m.calories ?? 0) === 0 && (m.protein ?? 0) === 0 && (m.carbs ?? 0) === 0 && (m.fat ?? 0) === 0)
}

export function getRecipeStatus(
  recipeIngredients: RecipeIngredient[],
  ingredientMap: Map<string, Ingredient>
): RecipeStatus {
  const total = recipeIngredients.length
  let linked = 0
  let nutritionOk = 0
  let pricingOk = 0
  let latestPriceUpdate: string | null = null

  for (const ri of recipeIngredients) {
    const variant = resolveVariant(ri, ingredientMap)
    if (!ri.ingredientId || !variant) continue
    linked++
    if (hasNutritionData(variant)) nutritionOk++
    if (variant.costPerServing != null) {
      pricingOk++
      if (variant.priceLastUpdated && (!latestPriceUpdate || variant.priceLastUpdated > latestPriceUpdate)) {
        latestPriceUpdate = variant.priceLastUpdated
      }
    }
  }

  return {
    totalIngredients: total,
    linkedCount: linked,
    unlinkedCount: total - linked,
    allLinked: total > 0 && linked === total,
    nutritionCompleteCount: nutritionOk,
    nutritionComplete: linked > 0 && nutritionOk === linked,
    missingPricingCount: linked - pricingOk,
    pricingComplete: linked > 0 && pricingOk === linked,
    latestPriceUpdate,
  }
}

export function formatPriceDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
