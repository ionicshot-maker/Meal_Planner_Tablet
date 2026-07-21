import { getDB } from './schema'
import type { ProcessedReceipt } from '@/types'

export async function getAllProcessedReceipts(): Promise<ProcessedReceipt[]> {
  const db = await getDB()
  return db.getAll('processedReceipts')
}

export async function saveProcessedReceipt(receipt: ProcessedReceipt): Promise<void> {
  const db = await getDB()
  await db.put('processedReceipts', receipt)
}

// A receipt is treated as a likely re-scan when store, date, and total (within
// a cent, to absorb rounding) all match a previously-processed one.
export async function findMatchingProcessedReceipt(
  store: string | null,
  date: string | null,
  total: number | null
): Promise<ProcessedReceipt | undefined> {
  if (!store || !date || total == null) return undefined
  const all = await getAllProcessedReceipts()
  return all.find(r =>
    r.store?.trim().toLowerCase() === store.trim().toLowerCase() &&
    r.date === date &&
    r.total != null && Math.abs(r.total - total) < 0.01
  )
}
