import type { NutriscoreGrade, NovaGroupNum, RecipeIngredient, Ingredient } from '@/types'

export const NUTRISCORE_COLORS: Record<NutriscoreGrade, string> = {
  A: '#1E7B34',
  B: '#7CB342',
  C: '#F1C40F',
  D: '#E67E22',
  E: '#C0392B',
}

export const NUTRISCORE_TEXT_COLORS: Record<NutriscoreGrade, string> = {
  A: '#FFFFFF',
  B: '#FFFFFF',
  C: '#1C1C1E',
  D: '#FFFFFF',
  E: '#FFFFFF',
}

export const NUTRISCORE_DESCRIPTIONS: Record<NutriscoreGrade, string> = {
  A: 'Best nutritional quality — fruits, vegetables, whole grains, lean proteins',
  B: 'Good nutritional quality',
  C: 'Average nutritional quality',
  D: 'Poor nutritional quality',
  E: 'Worst nutritional quality — heavily processed foods high in sugar, salt, or saturated fat',
}

export const NOVA_LABELS: Record<NovaGroupNum, string> = {
  1: 'Unprocessed',
  2: 'Minimally Processed',
  3: 'Processed',
  4: 'Ultra Processed',
}

export const NOVA_COLORS: Record<NovaGroupNum, string> = {
  1: '#1E7B34',
  2: '#7CB342',
  3: '#F1C40F',
  4: '#C0392B',
}

export const NOVA_TEXT_COLORS: Record<NovaGroupNum, string> = {
  1: '#FFFFFF',
  2: '#FFFFFF',
  3: '#1C1C1E',
  4: '#FFFFFF',
}

export const NOVA_DESCRIPTIONS: Record<NovaGroupNum, string> = {
  1: 'Unprocessed — foods in their natural state, like fresh produce, meat, and plain grains',
  2: 'Minimally Processed — simple processing like canning, drying, or milling',
  3: 'Processed — Group 1/2 foods with added salt, sugar, or oil, like cheese or cured meats',
  4: 'Ultra Processed — industrial food formulations with many additives',
}

// Union of every linked variant's allergens across a recipe's ingredient list.
export function getRecipeAllergens(
  recipeIngredients: RecipeIngredient[],
  ingredientMap: Map<string, Ingredient>
): string[] {
  const set = new Set<string>()
  for (const ri of recipeIngredients) {
    const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
    if (!ing) continue
    const variant = ing.variants.find(v => v.id === ri.variantId) ?? ing.variants[0]
    for (const a of variant?.allergens ?? []) set.add(a)
  }
  return [...set]
}

// Average Nova group (rounded) across every linked ingredient that has one set —
// ingredients with no Nova data are excluded rather than treated as 0.
export function getRecipeNovaAverage(
  recipeIngredients: RecipeIngredient[],
  ingredientMap: Map<string, Ingredient>
): NovaGroupNum | null {
  const groups: NovaGroupNum[] = []
  for (const ri of recipeIngredients) {
    const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
    if (!ing) continue
    const variant = ing.variants.find(v => v.id === ri.variantId) ?? ing.variants[0]
    if (variant?.novaGroup != null) groups.push(variant.novaGroup)
  }
  if (groups.length === 0) return null
  const avg = groups.reduce((a, b) => a + b, 0) / groups.length
  return Math.min(4, Math.max(1, Math.round(avg))) as NovaGroupNum
}
