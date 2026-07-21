import { getDB } from './schema'
import { now } from '@/utils/ids'
import type { MealPlanDay, MealPlanWeekTemplate, GroceryList } from '@/types'

export async function getMealPlanDay(date: string): Promise<MealPlanDay | undefined> {
  const db = await getDB()
  return db.get('mealPlanDays', date)
}

export async function getMealPlanDays(dates: string[]): Promise<Map<string, MealPlanDay>> {
  const db = await getDB()
  const map = new Map<string, MealPlanDay>()
  await Promise.all(
    dates.map(async d => {
      const day = await db.get('mealPlanDays', d)
      if (day) map.set(d, day)
    })
  )
  return map
}

export async function saveMealPlanDay(day: MealPlanDay): Promise<void> {
  const db = await getDB()
  day.updatedAt = now()
  await db.put('mealPlanDays', day)
}

export async function deleteMealPlanDay(date: string): Promise<void> {
  const db = await getDB()
  await db.delete('mealPlanDays', date)
}

export async function getAllMealPlanTemplates(): Promise<MealPlanWeekTemplate[]> {
  const db = await getDB()
  return db.getAll('mealPlanTemplates')
}

export async function saveMealPlanTemplate(template: MealPlanWeekTemplate): Promise<void> {
  const db = await getDB()
  await db.put('mealPlanTemplates', template)
}

export async function deleteMealPlanTemplate(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('mealPlanTemplates', id)
}

// Count of days that have at least one meal assigned, across the whole local
// database (not scoped to whatever week the Meal Planner happens to be showing) —
// used for the small "X days planned" header indicator and the Data tab's count
// summary, both meant to make a stale/partial sync obvious at a glance.
export async function getPlannedDayCount(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('mealPlanDays')
  return all.filter(d => Object.values(d.meals).some(slot => slot.length > 0)).length
}

export async function getActiveGroceryListsInRange(
  startDate: string,
  endDate: string
): Promise<GroceryList[]> {
  const db = await getDB()
  const active = await db.getAllFromIndex('groceryLists', 'by-status', 'active')
  return active.filter(gl => gl.startDate <= endDate && gl.endDate >= startDate)
}
