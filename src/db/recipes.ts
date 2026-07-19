import { getDB } from './schema'
import type { Recipe } from '@/types'

export async function getAllRecipes(includeTemplates = false): Promise<Recipe[]> {
  const db = await getDB()
  const all = await db.getAll('recipes')
  return includeTemplates ? all : all.filter(r => !r.isTemplate)
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const db = await getDB()
  return db.get('recipes', id)
}

export async function getFavoriteRecipes(): Promise<Recipe[]> {
  const all = await getAllRecipes()
  return all.filter(r => r.isFavorite)
}

export async function getRecipeTemplates(): Promise<Recipe[]> {
  const all = await getAllRecipes(true)
  return all.filter(r => r.isTemplate)
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  const db = await getDB()
  recipe.updatedAt = new Date().toISOString()
  await db.put('recipes', recipe)
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('recipes', id)
}

export async function searchRecipes(query: string, tags?: string[]): Promise<Recipe[]> {
  const all = await getAllRecipes()
  const q = query.toLowerCase().trim()
  return all.filter(r => {
    const matchesQuery = !q || r.name.toLowerCase().includes(q)
    const matchesTags = !tags?.length || tags.every(t => r.tags.includes(t))
    return matchesQuery && matchesTags
  })
}

export function cloneRecipeFromTemplate(template: Recipe): Recipe {
  return {
    ...template,
    id: crypto.randomUUID(),
    name: template.name,
    isTemplate: false,
    isFavorite: false,
    verifiedServingCount: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
