import type { IDBPTransaction } from 'idb'
import { getDB } from './schema'
import { now } from '@/utils/ids'
import type { Recipe, MealPlanDay } from '@/types'
import type { MealPlannerDB } from './schema'

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

// Every place a recipe id can be referenced elsewhere in the app, confirmed
// against the actual data model (src/types/index.ts) before writing any of
// this — the recipe-domain equivalent of mergeIngredients.ts's
// repointIngredientReferences():
//   - mealPlanDays: MealSlotItem.recipeId / .individualAssignments{personId: recipeId}
//   - mealPlanTemplates: each MealPlanWeekTemplate.days[] holds its OWN
//     independent snapshot of the identical MealPlanDay/MealSlotItem shape
//     (confirmed 2026-07-24 while investigating this — previously never
//     repointed at all: MealPlannerPage.tsx's handleSaveTemplate() snapshots
//     the current week's recipeIds into the template at save time, and
//     handleApplyTemplate() copies that snapshot verbatim into a real, live
//     mealPlanDay every time the template is applied — so a stale id here
//     silently reappears in the live plan on every future use. Confirmed as
//     an actual observable bug, not just a theoretical gap:
//     MealSlotSection.tsx's recipes.get(item.recipeId) returns undefined
//     for a discarded id and falls back to a bare "—" label with no
//     warning, and DayDetail.tsx's time/macro totals silently skip
//     (undercount) anything that doesn't resolve, guarded by `if (r)` with
//     no indication anything is missing.
//   - collections: RecipeCollection.recipeIds[]
//   - macroLogs: MacroLogEntry.recipeId (confirmed 2026-07-24: actually
//     populated — DayLog.tsx's handlePlanItemServings() sets it from the
//     logged meal-plan item — but never read back anywhere in the app
//     today; repointed defensively regardless, the same precedent as
//     MacroLogEntry.variantId in the ingredient-reference fix)
// Not referenced anywhere, confirmed: groceryLists (ingredient/variant ids
// only), householdItems/references/processedReceipts (unrelated entities),
// settings.
export interface RecipeReferenceCounts {
  mealPlanDays: number
  mealPlanTemplates: number
  collections: number
  macroLogs: number
}

export const EMPTY_RECIPE_REFERENCE_COUNTS: RecipeReferenceCounts = {
  mealPlanDays: 0, mealPlanTemplates: 0, collections: 0, macroLogs: 0,
}

// Repoints fromId -> toId across one day's meal slots in place. Shared by
// both the top-level mealPlanDays store and each day nested inside a
// mealPlanTemplates record, since both hold the exact same DayMeals shape.
function repointDayMeals(day: MealPlanDay, fromId: string, toId: string): boolean {
  let changed = false
  const slots = [day.meals.breakfast, day.meals.lunch, day.meals.dinner, day.meals.snacks, day.meals.drinks ?? []]
  for (const slot of slots) {
    for (const item of slot) {
      if (item.recipeId === fromId) {
        item.recipeId = toId
        changed = true
      }
      if (item.individualAssignments) {
        for (const personId of Object.keys(item.individualAssignments)) {
          if (item.individualAssignments[personId] === fromId) {
            item.individualAssignments[personId] = toId
            changed = true
          }
        }
      }
    }
  }
  return changed
}

type RecipeRepointTx = IDBPTransaction<
  MealPlannerDB,
  ['recipes', 'mealPlanDays', 'mealPlanTemplates', 'collections', 'macroLogs'],
  'readwrite'
>

// The actual reference-discovery/repointing logic — extracted so it has
// exactly one implementation, used by resolveRecipeDuplicate()
// (src/db/supabase.ts) and available for any future recipe-merge feature
// (there is no "mergeRecipes()" today, unlike mergeIngredients()) rather
// than being reimplemented per-caller. Operates purely on an already-open
// transaction's store handles and the two ids involved.
export async function repointRecipeReferences(
  tx: RecipeRepointTx,
  fromId: string,
  toId: string,
): Promise<RecipeReferenceCounts> {
  const dayStore = tx.objectStore('mealPlanDays')
  const templateStore = tx.objectStore('mealPlanTemplates')
  const collectionStore = tx.objectStore('collections')
  const macroStore = tx.objectStore('macroLogs')

  const counts: RecipeReferenceCounts = { mealPlanDays: 0, mealPlanTemplates: 0, collections: 0, macroLogs: 0 }

  const days = await dayStore.getAll()
  for (const day of days) {
    if (repointDayMeals(day, fromId, toId)) {
      day.updatedAt = now()
      await dayStore.put(day)
      counts.mealPlanDays++
    }
  }

  const templates = await templateStore.getAll()
  for (const template of templates) {
    let templateChanged = false
    for (const day of template.days) {
      if (repointDayMeals(day, fromId, toId)) templateChanged = true
    }
    if (templateChanged) {
      await templateStore.put(template)
      counts.mealPlanTemplates++
    }
  }

  const collections = await collectionStore.getAll()
  for (const c of collections) {
    if (c.recipeIds.includes(fromId)) {
      c.recipeIds = c.recipeIds.map(id => (id === fromId ? toId : id))
      c.updatedAt = now()
      await collectionStore.put(c)
      counts.collections++
    }
  }

  const macroLogs = await macroStore.getAll()
  for (const entry of macroLogs) {
    if (entry.recipeId === fromId) {
      entry.recipeId = toId
      await macroStore.put(entry)
      counts.macroLogs++
    }
  }

  return counts
}
