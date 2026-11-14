/**
 * How a local Meal Planner record maps to the "wire" record the server stores, and how a change is detected.
 * Pure (no DOM, no IndexedDB, no app imports) so the same code runs in the app and in the server's tests.
 *
 * Local records are plain: they have no sync envelope. The wire record is the local record plus
 *   - `id`         (the record's own id; the date for a meal-plan day; "singleton" for settings),
 *   - `updatedAt`  (always present -- the last-writer-wins clock),
 *   - `deletedAt`  (only on a tombstone).
 */

export const SYNC_TABLES = [
  'ingredients', 'recipes', 'mealPlanDays', 'groceryLists', 'householdItems', 'collections', 'references', 'settings',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export const isSyncTable = (t: string): t is SyncTable => (SYNC_TABLES as readonly string[]).includes(t);

/** Tables whose records are matched by name when they arrive from the server (same name + different id = a possible duplicate). */
export const NAMED_TABLES: readonly SyncTable[] = ['ingredients', 'recipes'];
export const normName = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().trim() : '');

export interface WireRec extends Record<string, unknown> { id: string; updatedAt: string; deletedAt?: string | null }
export type LocalRec = Record<string, unknown>;

/** Settings that are the household's (everything else in settings is this device's own: text size, keys, prompts...).
 * The server also strips secrets, but this whitelist is the primary guard: only these keys ever leave the device. */
export const SYNCED_SETTINGS_KEYS = [
  'householdName', 'unitSystem', 'geminiModel', 'nutrientToggles', 'macroHistoryDays',
  'storePreferenceEnabled', 'householdSize', 'people', 'setupComplete',
  'ingredientCategories', 'recipeTags', 'brands', 'stores',
  'ingredientDisplay', 'allergenWatchList',
] as const;

const EPOCH = '1970-01-01T00:00:00.000Z';

/** A shallow copy of `o` without the listed keys. */
const omit = (o: Record<string, unknown>, ...keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** The id a record is known by on the server. */
export function recordId(table: SyncTable, rec: LocalRec): string | undefined {
  if (table === 'settings') return 'singleton';
  const v = table === 'mealPlanDays' ? rec.date : rec.id;
  return typeof v === 'string' && v ? v : undefined;
}

/** The key a record is stored under in IndexedDB for `table` (settings live under 'app'). */
export const localKey = (table: SyncTable, id: string) => (table === 'settings' ? 'app' : id);

/** A record's own last-modified time. Some older rows have no `updatedAt`; fall back to other timestamps, then to the epoch. */
function stamp(rec: LocalRec): string {
  for (const f of ['updatedAt', 'createdAt', 'generatedAt']) {
    const v = rec[f];
    if (typeof v === 'string' && v) return v;
  }
  return EPOCH;
}

export function toWire(table: SyncTable, rec: LocalRec): WireRec | undefined {
  const id = recordId(table, rec);
  if (!id) return undefined;
  if (table === 'settings') {
    const out: Record<string, unknown> = {};
    for (const k of SYNCED_SETTINGS_KEYS) if (rec[k] !== undefined) out[k] = rec[k];
    const ai = rec.ai as { provider?: unknown } | undefined;
    if (ai && typeof ai.provider === 'string') out.aiProvider = ai.provider;
    return { ...out, id, updatedAt: stamp(rec) };
  }
  return { ...omit(rec, 'deletedAt'), id, updatedAt: stamp(rec) };
}

/** A pulled (live) wire record turned back into what the app stores. Not used for settings (merged by the store). */
export function fromWire(table: SyncTable, wire: WireRec): LocalRec {
  // a meal-plan day is keyed by its own `date`; the `id` exists only on the wire
  return table === 'mealPlanDays' ? omit(wire, 'deletedAt', 'id') : omit(wire, 'deletedAt');
}

export const tombstone = (id: string, at: string): WireRec => ({ id, updatedAt: at, deletedAt: at });

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** The synced CONTENT of a wire record: everything except `updatedAt` (it changes on every save, even a no-op one) and
 * `deletedAt` (reduced to a deleted/not-deleted bit: a tombstone is content). Key order never matters. */
export function contentOf(wire: WireRec): string {
  return canon({ ...omit(wire, 'updatedAt', 'deletedAt'), __deleted: wire.deletedAt ? 1 : 0 });
}

/** Compact stable hash (two FNV-1a passes -> 16 hex chars). Only used to detect "changed since last sync". */
export function contentHash(wire: WireRec): string {
  const s = contentOf(wire);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** What the sync state remembers for a record that is deleted on both sides. */
export const DELETED_HASH = 'deleted';
/** What it remembers for a record that arrived but was held back for duplicate review. */
export const HELD_HASH = 'held';
