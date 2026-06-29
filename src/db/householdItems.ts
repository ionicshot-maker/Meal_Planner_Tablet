import { getDB } from './schema'
import type { HouseholdItem } from '@/types'

export async function getAllHouseholdItems(): Promise<HouseholdItem[]> {
  const db = await getDB()
  const all = await db.getAll('householdItems')
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveHouseholdItem(item: HouseholdItem): Promise<void> {
  const db = await getDB()
  await db.put('householdItems', item)
}

export async function deleteHouseholdItem(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('householdItems', id)
}
