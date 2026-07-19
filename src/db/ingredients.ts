import { getDB } from './schema'
import { normalizeIngredient } from '@/utils/importNormalization'
import { suggestCategory } from '@/utils/categoryRules'
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

// One-time repair for ingredients saved via Settings → Data → Import (or any
// other path) that bypassed normalization and landed in the database in a raw,
// non-app shape — most commonly an Open Food Facts bulk-converter export whose
// variants carry flat macro fields instead of a nested `macros` object. Those
// records render fine as long as nothing reads `variant.macros.<field>`
// directly, but the missing `macros` object still means broken nutrition/cost
// everywhere it matters, so this reshapes them in place using the same
// normalization the JSON Import tab applies, preserving every id so existing
// recipe links keep working.
export async function repairLegacyIngredientData(): Promise<number> {
  const all = await getAllIngredients(true)
  const broken = all.filter(i => i.variants.some(v => !v.macros))
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
// as "Beverages". Re-derives a category from each ingredient's name via the same
// priority-ordered keyword rules the external converter tool uses (see
// utils/categoryRules.ts) and reassigns only when that differs from what's currently
// stored — items with no keyword match, or whose suggested category already matches,
// are left untouched. Gated by settings.miscategoryFixed so it only ever runs once.
export async function fixMiscategorizedIngredients(): Promise<number> {
  const all = await getAllIngredients(true)
  const db = await getDB()
  let fixed = 0
  for (const ingredient of all) {
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
