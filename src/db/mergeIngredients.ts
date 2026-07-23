import { getDB } from './schema'
import { getIngredient, saveIngredient, deleteIngredient } from './ingredients'
import { getAllRecipes, saveRecipe } from './recipes'

// Every place an ingredient id (or one of its variant ids) can be referenced
// elsewhere in the app, confirmed against the actual data model in
// src/types/index.ts and src/db/schema.ts before writing any of this:
//   - recipes: Recipe.ingredients[].ingredientId / .variantId
//   - groceryLists: GroceryItem.ingredientId / .variantId, inside
//     items[]/manualItems[]/remainderItems[] (every list, any status —
//     active, completed, archived)
//   - macroLogs: MacroLogEntry.variantId only (no ingredientId field on this
//     type). Checked every write path in the app — this field isn't
//     actually populated anywhere today, but it's part of the persisted
//     schema, so it's handled defensively rather than assumed safe to skip.
// Not referenced anywhere, confirmed: mealPlanDays/mealPlanTemplates (only
// ever hold a recipeId — ingredient links are transitive through the
// recipe, so repointing recipes covers them automatically), collections
// (recipeIds only), householdItems/references/processedReceipts (unrelated
// entities), settings. Also not touched: the device-local "recently linked"
// localStorage cache (src/utils/recentlyLinked.ts) — a 10-entry UI
// convenience that isn't persisted app data and ages out on its own.
export interface IngredientReferenceCounts {
  recipes: number
  groceryLists: number
  macroLogs: number
}

export const EMPTY_REFERENCE_COUNTS: IngredientReferenceCounts = { recipes: 0, groceryLists: 0, macroLogs: 0 }

export function totalReferences(counts: IngredientReferenceCounts): number {
  return counts.recipes + counts.groceryLists + counts.macroLogs
}

// Read-only — how many places reference this ingredient right now. Used to
// warn before a plain delete (which does NOT repoint anything, unlike
// mergeIngredients below).
export async function countIngredientReferences(ingredientId: string): Promise<IngredientReferenceCounts> {
  const ingredient = await getIngredient(ingredientId)
  const variantIds = new Set(ingredient?.variants.map(v => v.id) ?? [])
  const db = await getDB()

  const recipes = await getAllRecipes(true)
  const recipeCount = recipes.filter(r => r.ingredients.some(ri => ri.ingredientId === ingredientId)).length

  const groceryLists = await db.getAll('groceryLists')
  const groceryCount = groceryLists.filter(gl =>
    [...gl.items, ...gl.manualItems, ...gl.remainderItems].some(gi => gi.ingredientId === ingredientId)
  ).length

  const macroLogs = await db.getAll('macroLogs')
  const macroCount = macroLogs.filter(m => m.variantId != null && variantIds.has(m.variantId)).length

  return { recipes: recipeCount, groceryLists: groceryCount, macroLogs: macroCount }
}

export interface MergeOptions {
  // If provided and different from keep's current category, the surviving
  // (kept) ingredient's category is updated to this value as the last step
  // of the merge. Without this, a category disagreement between the two
  // records was silently resolved by "whichever one was kept wins" with no
  // review — found live merging real barcode-duplicate pairs (Beef Broth:
  // Meat & Poultry vs. Soups & Broths). Only meaningful when it's one of
  // the two ingredients' own categories — this isn't a general re-categorize
  // knob, just a way to let the user pick between the two that already
  // disagreed, so the merge doesn't silently discard whichever wasn't kept.
  category?: string
}

// Re-points every reference to mergeAwayId (and any of its own variant ids)
// onto keepId across every store above, then deletes mergeAwayId. Straight
// one-for-one replacement — no parent/child or multi-variant merge: a
// reference that had pinned a specific variant of the ingredient being
// merged away is repointed to keepId's *default* variant, since there's no
// reliable way to know which of keep's variants corresponds to the one
// going away without a real variant-matching feature (deliberately not
// built here — see MealPlannerApp_Reference.md).
export async function mergeIngredients(
  keepId: string,
  mergeAwayId: string,
  options?: MergeOptions
): Promise<IngredientReferenceCounts> {
  if (keepId === mergeAwayId) throw new Error('Cannot merge an ingredient with itself')

  const keep = await getIngredient(keepId)
  const mergeAway = await getIngredient(mergeAwayId)
  if (!keep) throw new Error(`Ingredient ${keepId} not found`)
  if (!mergeAway) throw new Error(`Ingredient ${mergeAwayId} not found`)

  const mergeAwayVariantIds = new Set(mergeAway.variants.map(v => v.id))
  const keepDefaultVariantId = keep.defaultVariantId || keep.variants[0]?.id

  const counts: IngredientReferenceCounts = { recipes: 0, groceryLists: 0, macroLogs: 0 }

  // Recipes
  const recipes = await getAllRecipes(true)
  for (const recipe of recipes) {
    let changed = false
    for (const ri of recipe.ingredients) {
      if (ri.ingredientId === mergeAwayId) {
        ri.ingredientId = keepId
        if (ri.variantId && mergeAwayVariantIds.has(ri.variantId)) ri.variantId = keepDefaultVariantId
        changed = true
      }
    }
    if (changed) {
      await saveRecipe(recipe)
      counts.recipes++
    }
  }

  const db = await getDB()

  // Grocery lists — every status (active/completed/archived), all three
  // item buckets.
  const groceryLists = await db.getAll('groceryLists')
  for (const list of groceryLists) {
    let changed = false
    for (const bucket of [list.items, list.manualItems, list.remainderItems]) {
      for (const item of bucket) {
        if (item.ingredientId === mergeAwayId) {
          item.ingredientId = keepId
          if (item.variantId && mergeAwayVariantIds.has(item.variantId)) item.variantId = keepDefaultVariantId
          changed = true
        }
      }
    }
    if (changed) {
      await db.put('groceryLists', list)
      counts.groceryLists++
    }
  }

  // Macro logs — variantId only, see the file-level note above.
  const macroLogs = await db.getAll('macroLogs')
  for (const entry of macroLogs) {
    if (entry.variantId != null && mergeAwayVariantIds.has(entry.variantId)) {
      entry.variantId = keepDefaultVariantId
      await db.put('macroLogs', entry)
      counts.macroLogs++
    }
  }

  await deleteIngredient(mergeAwayId)

  if (options?.category && options.category !== keep.category) {
    await saveIngredient({ ...keep, category: options.category })
  }

  return counts
}
