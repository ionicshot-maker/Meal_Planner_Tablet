import { getDB } from './schema'
import type { MacroLogEntry } from '@/types'

export async function getEntriesForDay(date: string, personId: string): Promise<MacroLogEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('macroLogs', 'by-person', personId)
  return all.filter(e => e.date === date)
}

export async function saveEntry(entry: MacroLogEntry): Promise<void> {
  const db = await getDB()
  await db.put('macroLogs', entry)
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('macroLogs', id)
}

export async function getEntriesForRange(
  personId: string,
  startDate: string,
  endDate: string
): Promise<MacroLogEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('macroLogs', 'by-person', personId)
  return all.filter(e => e.date >= startDate && e.date <= endDate)
}

// Total entry count across everyone — macro logs are device-local (never synced,
// see SYNCED_SETTINGS_KEYS/runSync), so this is mainly useful on the Data tab as a
// reminder that this particular number is expected to differ between devices.
export async function getMacroLogCount(): Promise<number> {
  const db = await getDB()
  return db.count('macroLogs')
}

export async function pruneOldEntries(maxDays: number): Promise<void> {
  const db = await getDB()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const all = await db.getAll('macroLogs')
  await Promise.all(
    all.filter(e => e.date < cutoffStr).map(e => db.delete('macroLogs', e.id))
  )
}
