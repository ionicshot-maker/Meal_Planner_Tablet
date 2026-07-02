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

export async function getActiveGroceryListsInRange(
  startDate: string,
  endDate: string
): Promise<GroceryList[]> {
  const db = await getDB()
  const active = await db.getAllFromIndex('groceryLists', 'by-status', 'active')
  return active.filter(gl => gl.startDate <= endDate && gl.endDate >= startDate)
}
