import type { IDBPTransaction } from 'idb'
import { getDB } from './schema'
import { getIngredient } from './ingredients'
import { getAllRecipes } from './recipes'
import { now } from '@/utils/ids'
import type { MealPlannerDB } from './schema'

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
//
// Genuinely atomic (2026-07-24 fix) — every read and write below runs
// inside one shared IndexedDB transaction spanning ingredients/recipes/
// groceryLists/macroLogs, using the same pattern as
// applyReceiptSaveBatch() (ingredients.ts) and DataSection.tsx's
// performReset(): a single db.transaction([...stores], 'readwrite'), all
// reads/writes issued through tx.objectStore(...) rather than the normal
// getDB()-per-call helpers, and an explicit tx.abort() + rethrow on any
// error. If any step throws — a missing ingredient, an unexpected write
// failure — the whole transaction aborts and IndexedDB rolls back every
// put/delete already issued in this call, including recipe/grocery-list/
// macro-log repoints that "succeeded" earlier in the same run. Either
// every affected record commits together, or none of them do; there is no
// partially-merged state to land in. This closes the previous gap where
// an interruption after ingredient deletion but before category
// reconciliation left the category permanently unreconciled (retrying
// threw immediately since mergeAway no longer existed) — that can no
// longer happen because deletion and category reconciliation are now
// part of the same atomic unit as everything else.
//
// All four affected stores (ingredients, recipes, groceryLists, macroLogs)
// live in the same IndexedDB database (MealPlannerDB), so a single
// transaction spanning all of them is directly supported by the platform —
// there is no store here that can't participate in one shared transaction.
export async function mergeIngredients(
  keepId: string,
  mergeAwayId: string,
  options?: MergeOptions
): Promise<IngredientReferenceCounts> {
  if (keepId === mergeAwayId) throw new Error('Cannot merge an ingredient with itself')

  const db = await getDB()
  const tx = db.transaction(['ingredients', 'recipes', 'groceryLists', 'macroLogs'], 'readwrite')
  const ingredientStore = tx.objectStore('ingredients')

  let counts: IngredientReferenceCounts = EMPTY_REFERENCE_COUNTS

  try {
    const keep = await ingredientStore.get(keepId)
    const mergeAway = await ingredientStore.get(mergeAwayId)
    if (!keep) throw new Error(`Ingredient ${keepId} not found`)
    if (!mergeAway) throw new Error(`Ingredient ${mergeAwayId} not found`)

    const mergeAwayVariantIds = new Set(mergeAway.variants.map(v => v.id))
    const keepDefaultVariantId = keep.defaultVariantId || keep.variants[0]?.id

    counts = await repointIngredientReferences(
      tx, mergeAwayId, mergeAwayVariantIds, keepId, keepDefaultVariantId
    )

    // Category reconciliation now happens BEFORE deletion, in the same
    // transaction, instead of as a separate put() after — so it can never
    // land in a state where deletion committed but reconciliation didn't.
    if (options?.category && options.category !== keep.category) {
      keep.category = options.category
      keep.updatedAt = now()
      await ingredientStore.put(keep)
    }

    await ingredientStore.delete(mergeAwayId)

    await tx.done
  } catch (err) {
    try { tx.abort() } catch { /* transaction already finished */ }
    // A validation throw above (e.g. "not found") happens before tx.done is
    // ever awaited; tx.abort() then rejects tx.done on its own, and with
    // nothing else listening that becomes an unhandled rejection (surfaced
    // empirically while writing this fix's verification script). Swallowing
    // it here is safe either way: if tx.done was already being awaited when
    // the error came from a genuine IDB request failure, this is a no-op on
    // an already-settled promise.
    tx.done.catch(() => {})
    throw err
  }

  return counts
}

// The shared store-list type both mergeIngredients() and Cloud Sync's
// resolveIngredientDuplicate() (src/db/supabase.ts) open their transaction
// with — kept as one alias so the two stay structurally interchangeable
// rather than silently drifting apart.
type MergeTx = IDBPTransaction<MealPlannerDB, ['ingredients', 'recipes', 'groceryLists', 'macroLogs'], 'readwrite'>

// The actual reference-discovery/repointing logic, extracted so it has
// exactly one implementation used by both mergeIngredients() (this file)
// and Cloud Sync's resolveIngredientDuplicate() (src/db/supabase.ts) — the
// two places in the app that ever need to retire one ingredient id in favor
// of another. Operates purely on an already-open transaction's store
// handles and the two ids/variant-id-sets involved; it does NOT require
// `fromId` to itself be a record present in the ingredients store — recipe/
// grocery/macro-log rows are matched by the literal id value stored on
// them, not by looking the id up. This matters for Cloud Sync's "keep
// local" resolution: the cloud-side id being discarded there is, by
// construction, never saved as a local Ingredient record at all (see the
// comment on resolveIngredientDuplicate() in supabase.ts) — repointing
// FROM an id that was never itself persisted locally is still well-defined
// and safe, it just always finds zero matches in practice.
export async function repointIngredientReferences(
  tx: MergeTx,
  fromId: string,
  fromVariantIds: Set<string>,
  toId: string,
  toDefaultVariantId: string | undefined,
): Promise<IngredientReferenceCounts> {
  const recipeStore = tx.objectStore('recipes')
  const groceryStore = tx.objectStore('groceryLists')
  const macroStore = tx.objectStore('macroLogs')

  const counts: IngredientReferenceCounts = { recipes: 0, groceryLists: 0, macroLogs: 0 }

  // Recipes
  const recipes = await recipeStore.getAll()
  for (const recipe of recipes) {
    let changed = false
    for (const ri of recipe.ingredients) {
      if (ri.ingredientId === fromId) {
        ri.ingredientId = toId
        if (ri.variantId && fromVariantIds.has(ri.variantId)) ri.variantId = toDefaultVariantId
        changed = true
      }
    }
    if (changed) {
      recipe.updatedAt = now()
      await recipeStore.put(recipe)
      counts.recipes++
    }
  }

  // Grocery lists — every status (active/completed/archived), all three
  // item buckets.
  const groceryLists = await groceryStore.getAll()
  for (const list of groceryLists) {
    let changed = false
    for (const bucket of [list.items, list.manualItems, list.remainderItems]) {
      for (const item of bucket) {
        if (item.ingredientId === fromId) {
          item.ingredientId = toId
          if (item.variantId && fromVariantIds.has(item.variantId)) item.variantId = toDefaultVariantId
          changed = true
        }
      }
    }
    if (changed) {
      await groceryStore.put(list)
      counts.groceryLists++
    }
  }

  // Macro logs — variantId only, see the file-level note above.
  const macroLogs = await macroStore.getAll()
  for (const entry of macroLogs) {
    if (entry.variantId != null && fromVariantIds.has(entry.variantId)) {
      entry.variantId = toDefaultVariantId
      await macroStore.put(entry)
      counts.macroLogs++
    }
  }

  return counts
}
