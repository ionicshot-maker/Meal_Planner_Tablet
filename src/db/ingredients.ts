import { getDB } from './schema'
import { normalizeIngredient } from '@/utils/importNormalization'
import { suggestCategory, RECLASSIFIABLE_CATEGORIES } from '@/utils/categoryRules'
import type { Ingredient, IngredientVariant } from '@/types'

export async function getAllIngredients(includeArchived = false): Promise<Ingredient[]> {
  const db = await getDB()
  const all = await db.getAll('ingredients')
  return includeArchived ? all : all.filter(i => !i.archived)
}

export async function getIngredient(id: string): Promise<Ingredient | undefined> {
  const db = await getDB()
  return db.get('ingredients', id)
}

export async function getIngredientsByCategory(category: string): Promise<Ingredient[]> {
  const db = await getDB()
  return db.getAllFromIndex('ingredients', 'by-category', category)
}

export async function saveIngredient(ingredient: Ingredient): Promise<void> {
  const db = await getDB()
  ingredient.updatedAt = new Date().toISOString()
  await db.put('ingredients', ingredient)
}

export async function deleteIngredient(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('ingredients', id)
}

export async function archiveIngredient(id: string): Promise<void> {
  const db = await getDB()
  const ingredient = await db.get('ingredients', id)
  if (!ingredient) return
  ingredient.archived = true
  ingredient.updatedAt = new Date().toISOString()
  await db.put('ingredients', ingredient)
}

export async function addVariantToIngredient(ingredientId: string, variant: IngredientVariant): Promise<void> {
  const db = await getDB()
  const ingredient = await db.get('ingredients', ingredientId)
  if (!ingredient) throw new Error(`Ingredient ${ingredientId} not found`)
  ingredient.variants.push(variant)
  ingredient.updatedAt = new Date().toISOString()
  await db.put('ingredients', ingredient)
}

// In-memory scan — barcode lives on the nested variant, not a top-level indexed
// field, and the ingredient count in this app is small enough that a full scan
// is simpler than denormalizing a separate barcode index.
export async function findIngredientByBarcode(barcode: string): Promise<Ingredient | undefined> {
  const code = barcode.trim()
  if (!code) return undefined
  const all = await getAllIngredients(true)
  return all.find(i => i.variants.some(v => v.barcode === code))
}

export async function searchIngredients(query: string, includeArchived = false): Promise<Ingredient[]> {
  const all = await getAllIngredients(includeArchived)
  const q = query.toLowerCase().trim()
  if (!q) return all
  return all.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.variants.some(v => v.brand.toLowerCase().includes(q))
  )
}

// A variant can carry a nested `macros` object that's present but effectively
// empty (every field defaulted to 0) while the real values are still sitting in
// old flat fields (variant.calories, variant.protein, ...) left over from a prior
// import — `!v.macros` alone misses this, since a zeroed-but-present object is
// still truthy. Recognizable by: macros is missing or all-zero, AND at least one
// flat macro field on the variant itself has a genuinely nonzero value to recover.
function hasRecoverableFlatMacros(v: IngredientVariant): boolean {
  const flat = v as IngredientVariant & { calories?: number; protein?: number; carbs?: number; fat?: number }
  if (!flat.calories && !flat.protein && !flat.carbs && !flat.fat) return false
  const m = v.macros
  return !m || (!m.calories && !m.protein && !m.carbs && !m.fat)
}

// One-time repair for ingredients saved via Settings → Data → Import (or any
// other path) that bypassed normalization and landed in the database in a raw,
// non-app shape — most commonly an Open Food Facts bulk-converter export whose
// variants carry flat macro fields instead of a nested `macros` object, or a
// nested `macros` object that's present but zeroed while real values are still
// sitting in those flat fields. Those records render fine as long as nothing
// reads `variant.macros.<field>` directly, but the missing/wrong `macros` object
// still means broken nutrition/cost everywhere it matters, so this reshapes them
// in place using the same normalization the JSON Import tab applies (which now
// merges nested and flat sources field-by-field — see importNormalization.ts),
// preserving every id so existing recipe links keep working.
export async function repairLegacyIngredientData(): Promise<number> {
  const all = await getAllIngredients(true)
  const broken = all.filter(i => i.variants.some(v => !v.macros || hasRecoverableFlatMacros(v)))
  if (broken.length === 0) return 0

  const db = await getDB()
  let repaired = 0
  for (const ingredient of broken) {
    // The stored object IS the raw shape at this point — normalizeIngredient
    // reads it structurally, so no cast-time validation is needed here.
    const fixed = normalizeIngredient(ingredient as unknown as Parameters<typeof normalizeIngredient>[0])
    if (!fixed) continue
    await db.put('ingredients', fixed)
    repaired++
  }
  return repaired
}

// One-time cleanup for ingredients that landed in the wrong category during import —
// most visibly, non-beverage items (pasta, bread, snacks, etc.) that were bulk-imported
// as "Beverages", plus miscellaneous items still lumped into the old catch-all buckets
// like "Baking & Pantry" (renamed from "Pantry", which used to hold everything from
// condiments to pasta to spice blends). Re-derives a category from each ingredient's
// name via the same priority-ordered keyword rules the external converter tool uses
// (see utils/categoryRules.ts) and reassigns only when: the suggested category differs
// from what's stored, AND the current category is one of the catch-all-prone buckets in
// RECLASSIFIABLE_CATEGORIES. Anything already sorted into a specific category (Pasta &
// Noodles, Condiments & Sauces, Canned Goods, etc.) is trusted and left alone even if a
// keyword happens to match elsewhere, so this can't undo a correct, specific
// categorization. Gated by settings.miscategoryFixed so it only ever runs once.
export async function fixMiscategorizedIngredients(): Promise<number> {
  const all = await getAllIngredients(true)
  const db = await getDB()
  let fixed = 0
  for (const ingredient of all) {
    if (!RECLASSIFIABLE_CATEGORIES.has(ingredient.category)) continue
    const suggested = suggestCategory(ingredient.name)
    if (suggested && suggested !== ingredient.category) {
      ingredient.category = suggested
      ingredient.updatedAt = new Date().toISOString()
      await db.put('ingredients', ingredient)
      fixed++
    }
  }
  return fixed
}

export function calcCostPerServing(variant: IngredientVariant): number | undefined {
  if (variant.packageCost != null && variant.totalServingsInPackage != null && variant.totalServingsInPackage > 0) {
    return variant.packageCost / variant.totalServingsInPackage
  }
  return undefined
}
