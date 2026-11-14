// Compares two backups (the app's native export format) record by record, the way the sync engine would: same id, same CONTENT
// (updatedAt ignored, settings reduced to the household's shared fields). Used to prove that nothing was lost between the live
// app's export, the file that was imported, and what a freshly joined device ends up holding.
import { contentHash, recordId, SYNC_TABLES, toWire, type LocalRec, type SyncTable } from '../../../src/sync/records.ts';

export type Backup = Record<string, unknown>;

export interface StoreDiff {
  store: SyncTable;
  a: number;
  b: number;
  onlyA: string[];
  onlyB: string[];
  /** Same id on both sides, different content. */
  changed: string[];
}
export interface Comparison { stores: StoreDiff[]; identical: boolean; notSynced: Record<string, [number, number]> }

/** The stores a device keeps to itself (macro logs and the like): reported by count only, never compared. */
const LOCAL_ONLY = ['mealPlanTemplates', 'macroLogs', 'processedReceipts'];

/** `onlySettingsKeys`: hash a settings record over just these shared keys (see compareBackups' `settingsSubset`). */
function hashes(backup: Backup, table: SyncTable, onlySettingsKeys?: string[]): { map: Map<string, string>; unkeyed: number } {
  const raw = backup[table];
  const rows: LocalRec[] = table === 'settings' ? (raw ? [raw as LocalRec] : []) : Array.isArray(raw) ? (raw as LocalRec[]) : [];
  const map = new Map<string, string>();
  let unkeyed = 0;
  for (const row of rows) {
    let wire = row && typeof row === 'object' ? toWire(table, row) : undefined;
    if (!wire) { unkeyed++; continue; }
    if (table === 'settings' && onlySettingsKeys) {
      const keep = new Set([...onlySettingsKeys, 'id', 'updatedAt']);
      wire = Object.fromEntries(Object.entries(wire).filter(([k]) => keep.has(k))) as typeof wire;
    }
    // (settings are already reduced to the household's shared fields by toWire: keys and device preferences never get this far)
    map.set(wire.id, contentHash(wire));
  }
  if (unkeyed) map.set(`(${unkeyed} record${unkeyed === 1 ? '' : 's'} without an id)`, `unkeyed:${unkeyed}`);
  return { map, unkeyed };
}

export interface CompareOptions {
  /** Treat `b`'s settings as allowed to hold MORE shared fields than `a`'s. A device that joins keeps its own defaults for any shared
   * setting the household's record never had, which is not data loss; but every shared setting that IS in `a` must match in `b`. */
  settingsSubset?: boolean;
}

export function compareBackups(a: Backup, b: Backup, opts: CompareOptions = {}): Comparison {
  const stores: StoreDiff[] = [];
  const sharedKeysInA = opts.settingsSubset && a.settings ? Object.keys(toWire('settings', a.settings as LocalRec) ?? {}) : undefined;
  for (const store of SYNC_TABLES) {
    const A = hashes(a, store, sharedKeysInA).map;
    const B = hashes(b, store, sharedKeysInA).map;
    const onlyA = [...A.keys()].filter((k) => !B.has(k));
    const onlyB = [...B.keys()].filter((k) => !A.has(k));
    const changed = [...A.keys()].filter((k) => B.has(k) && A.get(k) !== B.get(k));
    stores.push({ store, a: A.size, b: B.size, onlyA, onlyB, changed });
  }
  const notSynced: Record<string, [number, number]> = {};
  for (const s of LOCAL_ONLY) {
    const ca = Array.isArray(a[s]) ? (a[s] as unknown[]).length : 0;
    const cb = Array.isArray(b[s]) ? (b[s] as unknown[]).length : 0;
    if (ca || cb) notSynced[s] = [ca, cb];
  }
  return { stores, identical: stores.every((s) => !s.onlyA.length && !s.onlyB.length && !s.changed.length), notSynced };
}

export function formatComparison(c: Comparison, nameA = 'A', nameB = 'B'): string {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const lines = [`${pad('store', 16)}${pad(nameA, 8)}${pad(nameB, 8)}result`];
  for (const s of c.stores) {
    if (!s.a && !s.b) continue;
    const bits: string[] = [];
    if (s.onlyA.length) bits.push(`${s.onlyA.length} only in ${nameA}`);
    if (s.onlyB.length) bits.push(`${s.onlyB.length} only in ${nameB}`);
    if (s.changed.length) bits.push(`${s.changed.length} differ`);
    lines.push(`${pad(s.store, 16)}${pad(s.a, 8)}${pad(s.b, 8)}${bits.length ? bits.join(', ') : 'same'}`);
  }
  for (const [store, [x, y]] of Object.entries(c.notSynced)) lines.push(`${pad(store, 16)}${pad(x, 8)}${pad(y, 8)}(stays on each device; not synced)`);
  for (const s of c.stores) {
    for (const [label, ids] of [[`only in ${nameA}`, s.onlyA], [`only in ${nameB}`, s.onlyB], ['content differs', s.changed]] as const) {
      if (ids.length) lines.push(`  ${s.store} — ${label}: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? `, … (+${ids.length - 5} more)` : ''}`);
    }
  }
  lines.push(c.identical ? 'IDENTICAL: every synced record matches.' : 'DIFFERENT: see the lines above.');
  return lines.join('\n');
}

export { recordId };
