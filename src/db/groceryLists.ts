import { getDB } from './schema'
import { now } from '@/utils/ids'
import type { GroceryList } from '@/types'

export async function getActiveGroceryList(): Promise<GroceryList | undefined> {
  const db = await getDB()
  const active = await db.getAllFromIndex('groceryLists', 'by-status', 'active')
  return active.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
}

export async function getGroceryHistory(): Promise<GroceryList[]> {
  const db = await getDB()
  const completed = await db.getAllFromIndex('groceryLists', 'by-status', 'completed')
  return completed.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}

export async function saveGroceryList(list: GroceryList): Promise<void> {
  const db = await getDB()
  list.updatedAt = now()
  await db.put('groceryLists', list)
}

export async function deleteGroceryList(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('groceryLists', id)
}

// Mark current active list as completed and prune history to 1 entry
export async function archiveAndPrune(): Promise<void> {
  const db = await getDB()
  const active = await db.getAllFromIndex('groceryLists', 'by-status', 'active')
  for (const list of active) {
    await db.put('groceryLists', { ...list, status: 'completed' })
  }
  const completed = await db.getAllFromIndex('groceryLists', 'by-status', 'completed')
  const sorted = completed.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  for (const old of sorted.slice(1)) {
    await db.delete('groceryLists', old.id)
  }
}
