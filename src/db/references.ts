import { getDB } from './schema'
import { now } from '@/utils/ids'
import type { KitchenReference } from '@/types'

export async function getAllReferences(): Promise<KitchenReference[]> {
  const db = await getDB()
  const all = await db.getAll('references')
  return all.sort((a, b) => a.title.localeCompare(b.title))
}

export async function getReference(id: string): Promise<KitchenReference | undefined> {
  const db = await getDB()
  return db.get('references', id)
}

export async function saveReference(ref: KitchenReference): Promise<void> {
  const db = await getDB()
  ref.updatedAt = now()
  await db.put('references', ref)
}

export async function deleteReference(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('references', id)
}
