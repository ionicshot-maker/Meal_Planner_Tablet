import type { Recipe, RecipeIngredient, Ingredient, Macros, IngredientUnit, WeightUnit, VolumeUnit } from '@/types'
import { convertWeight, convertVolume } from './units'

const WEIGHT_UNITS = new Set<string>(['oz', 'lb', 'g', 'kg'])
const VOLUME_UNITS = new Set<string>(['tsp', 'tbsp', 'cup', 'floz', 'ml', 'l'])

// Convert recipe-ingredient quantity to the variant's serving unit
function quantityInServingUnits(qty: number, from: IngredientUnit, to: IngredientUnit): number {
  if (from === to) return qty
  if (WEIGHT_UNITS.has(from) && WEIGHT_UNITS.has(to))
    return convertWeight(qty, from as WeightUnit, to as WeightUnit)
  if (VOLUME_UNITS.has(from) && VOLUME_UNITS.has(to))
    return convertVolume(qty, from as VolumeUnit, to as VolumeUnit)
  return qty   // count or incompatible: treat as 1:1
}

export function calcRecipeMacros(
  recipeIngredients: RecipeIngredient[],
  ingredientMap: Map<string, Ingredient>,
  totalServings: number
): Macros {
  const totals: Macros = { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 }
  if (totalServings <= 0) return totals

  for (const ri of recipeIngredients) {
    const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
    if (!ing) continue
    const variant = ing.variants.find(v => v.id === ri.variantId) ?? ing.variants[0]
    if (!variant || !variant.macros || variant.servingSize <= 0) continue

    const qInServingUnits = quantityInServingUnits(ri.quantity, ri.unit, variant.servingUnit)
    const servingsUsed = qInServingUnits / variant.servingSize

    const m = variant.macros
    totals.calories  += (m.calories  ?? 0) * servingsUsed
    totals.protein   += (m.protein   ?? 0) * servingsUsed
    totals.carbs     += (m.carbs     ?? 0) * servingsUsed
    totals.fiber     += (m.fiber     ?? 0) * servingsUsed
    totals.sugar     += (m.sugar     ?? 0) * servingsUsed
    totals.fat       += (m.fat       ?? 0) * servingsUsed
    totals.sodium    += (m.sodium    ?? 0) * servingsUsed
    if (m.saturatedFat != null) totals.saturatedFat = (totals.saturatedFat ?? 0) + m.saturatedFat * servingsUsed
    if (m.transFat    != null) totals.transFat      = (totals.transFat    ?? 0) + m.transFat    * servingsUsed
    if (m.alcohol     != null) totals.alcohol        = (totals.alcohol    ?? 0) + m.alcohol     * servingsUsed
  }

  // Per-serving
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    calories:     round(totals.calories     / totalServings),
    protein:      round(totals.protein      / totalServings),
    carbs:        round(totals.carbs        / totalServings),
    fiber:        round(totals.fiber        / totalServings),
    sugar:        round(totals.sugar        / totalServings),
    fat:          round(totals.fat          / totalServings),
    sodium:       round(totals.sodium       / totalServings),
    saturatedFat: totals.saturatedFat != null ? round(totals.saturatedFat / totalServings) : undefined,
    transFat:     totals.transFat     != null ? round(totals.transFat     / totalServings) : undefined,
    alcohol:      totals.alcohol      != null ? round(totals.alcohol      / totalServings) : undefined,
  }
}

export function calcRecipeCost(
  recipeIngredients: RecipeIngredient[],
  ingredientMap: Map<string, Ingredient>,
  totalServings: number
): number | undefined {
  if (totalServings <= 0) return undefined
  let total = 0
  let hasCost = false

  for (const ri of recipeIngredients) {
    const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
    if (!ing) continue
    const variant = ing.variants.find(v => v.id === ri.variantId) ?? ing.variants[0]
    if (!variant || !variant.costPerServing || variant.servingSize <= 0) continue

    const qInServingUnits = quantityInServingUnits(ri.quantity, ri.unit, variant.servingUnit)
    const servingsUsed = qInServingUnits / variant.servingSize
    total += variant.costPerServing * servingsUsed
    hasCost = true
  }

  if (!hasCost) return undefined
  return Math.round((total / totalServings) * 1000) / 1000
}

export function scaleIngredients(
  ingredients: RecipeIngredient[],
  scaleFactor: number
): RecipeIngredient[] {
  return ingredients.map(ri => ({
    ...ri,
    quantity: Math.round(ri.quantity * scaleFactor * 1000) / 1000,
  }))
}

export function buildIngredientMap(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map(i => [i.id, i]))
}

export function formatMacro(value: number | undefined, decimals = 1): string {
  if (value == null) return '—'
  return value % 1 === 0 ? value.toString() : value.toFixed(decimals)
}

// Normalize unit strings from AI to our IngredientUnit enum
export const UNIT_MAP: Record<string, IngredientUnit> = {
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', 'table spoon': 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml', millilitre: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  'fluid ounce': 'floz', 'fluid ounces': 'floz', 'fl oz': 'floz', floz: 'floz',
  can: 'can', cans: 'can',
  package: 'package', packages: 'package', pkg: 'package',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  piece: 'piece', pieces: 'piece',
  slice: 'slice', slices: 'slice',
  jar: 'jar', jars: 'jar',
  each: 'each', item: 'each', items: 'each',
}

export function normalizeUnit(raw: string): IngredientUnit {
  return UNIT_MAP[raw.toLowerCase().trim()] ?? 'each'
}

export function formatRecipeMacroLine(macros: Macros): string {
  return `${Math.round(macros.calories)} cal · ${formatMacro(macros.protein)}g protein · ${formatMacro(macros.carbs)}g carbs · ${formatMacro(macros.fat)}g fat`
}

export function attachRecipeMacros(recipe: Recipe, ingredientMap: Map<string, Ingredient>): Recipe {
  const macrosPerServing = calcRecipeMacros(recipe.ingredients, ingredientMap, recipe.servings)
  const costPerServing   = calcRecipeCost(recipe.ingredients, ingredientMap, recipe.servings)
  return { ...recipe, macrosPerServing, estimatedCostPerServing: costPerServing }
}
