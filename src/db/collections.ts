import { getDB } from './schema'
import { newId, now } from '@/utils/ids'
import type { RecipeCollection } from '@/types'

export async function getAllCollections(): Promise<RecipeCollection[]> {
  const db = await getDB()
  const all = await db.getAll('collections')
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveCollection(c: RecipeCollection): Promise<void> {
  const db = await getDB()
  await db.put('collections', c)
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('collections', id)
}

export async function createCollection(name: string): Promise<RecipeCollection> {
  const c: RecipeCollection = {
    id: newId(),
    name,
    recipeIds: [],
    createdAt: now(),
    updatedAt: now(),
  }
  await saveCollection(c)
  return c
}

export async function addRecipeToCollection(collectionId: string, recipeId: string): Promise<void> {
  const db = await getDB()
  const c = await db.get('collections', collectionId)
  if (!c || c.recipeIds.includes(recipeId)) return
  await db.put('collections', { ...c, recipeIds: [...c.recipeIds, recipeId], updatedAt: now() })
}

export async function removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<void> {
  const db = await getDB()
  const c = await db.get('collections', collectionId)
  if (!c) return
  await db.put('collections', { ...c, recipeIds: c.recipeIds.filter(id => id !== recipeId), updatedAt: now() })
}

export async function reorderCollectionRecipes(collectionId: string, recipeIds: string[]): Promise<void> {
  const db = await getDB()
  const c = await db.get('collections', collectionId)
  if (!c) return
  await db.put('collections', { ...c, recipeIds, updatedAt: now() })
}
