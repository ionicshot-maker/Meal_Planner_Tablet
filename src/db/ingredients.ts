import { getDB } from './schema'
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

export function calcCostPerServing(variant: IngredientVariant): number | undefined {
  if (variant.packageCost != null && variant.totalServingsInPackage != null && variant.totalServingsInPackage > 0) {
    return variant.packageCost / variant.totalServingsInPackage
  }
  return undefined
}
