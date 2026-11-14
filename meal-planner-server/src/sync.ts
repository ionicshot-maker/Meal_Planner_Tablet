import { Store, SYNC_TABLES, isSyncTable, type SyncTable } from './store.js';

/**
 * Sync protocol (record-level, server-ordered) -- the same protocol bill-planner-server speaks:
 *  - The server keeps one global, monotonically increasing revision. Every accepted write gets the next revision.
 *  - PULL: "give me everything with rev > since" (tombstones included).
 *  - PUSH: each change carries `baseRev`, the server rev the client last saw for that record (0 for a record it created).
 *    Accepted when the server's current rev for the record equals baseRev (or the record is new, or the content is already
 *    identical -- retries are idempotent). Otherwise it is a CONFLICT and the server returns its own copy; nothing is
 *    overwritten, so no edit is ever lost silently. How the client resolves a conflict is a client-side policy
 *    (last-writer-wins on `updatedAt`, with the loser kept in a local log).
 *
 * Meal Planner records have no `sync` envelope; they already carry `updatedAt`, so that is the only metadata required here.
 * The wire record is the stored record plus an `id` (the record's own id; the date for a meal-plan day; "singleton" for
 * settings). A DELETE is a tombstone: `{ id, updatedAt, deletedAt }` -- the rest of the record is not needed and not kept.
 */

export interface PushChange { table: string; id: string; record: Record<string, unknown>; baseRev: number }
export type PushResult =
  | { table: string; id: string; status: 'accepted' | 'unchanged'; rev: number }
  | { table: string; id: string; status: 'conflict'; rev: number; serverRecord: Record<string, unknown> }
  | { table: string; id: string; status: 'rejected'; reason: string };

/** Settings fields that must never live on the server: per-person secrets and leftovers from the Supabase era. The client also
 * sends only a whitelist of settings; this is the second line of defence. The fields are REMOVED, not nulled -- a client that
 * naively spreads a pulled settings record over its own would otherwise wipe its local key with a null.
 * Keep in step with the client's settings whitelist whenever a new provider or key is added. */
export const SETTINGS_SECRET_FIELDS = [
  'geminiApiKey', 'openaiApiKey', 'groqApiKey', 'usdaApiKey', 'ai',
  'supabaseUrl', 'supabaseAnonKey', 'householdSyncCode', 'familyShareCode', 'familyShareRole',
] as const;
export function redact(table: SyncTable, record: Record<string, unknown>): Record<string, unknown> {
  if (table !== 'settings') return record;
  const out = { ...record };
  for (const field of SETTINGS_SECRET_FIELDS) delete out[field];
  return out;
}

const DATE_ID = /^\d{4}-\d{2}-\d{2}$/;

export function validateChange(c: unknown): { ok: true; table: SyncTable; id: string; record: Record<string, unknown>; baseRev: number } | { ok: false; reason: string } {
  if (!c || typeof c !== 'object') return { ok: false, reason: 'change is not an object' };
  const { table, id, record, baseRev } = c as PushChange;
  if (!isSyncTable(table)) return { ok: false, reason: `unknown table "${String(table)}"` };
  if (typeof id !== 'string' || !id || id.length > 200) return { ok: false, reason: 'bad id' };
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'record is not an object' };
  const r = record as { id?: unknown; updatedAt?: unknown; deletedAt?: unknown };
  if (r.id !== id) return { ok: false, reason: 'record.id does not match id' };
  if (table === 'settings' && id !== 'singleton') return { ok: false, reason: 'settings id must be "singleton"' };
  if (table === 'mealPlanDays' && !DATE_ID.test(id)) return { ok: false, reason: 'mealPlanDays id must be a YYYY-MM-DD date' };
  if (typeof r.updatedAt !== 'string' || !r.updatedAt) return { ok: false, reason: 'record.updatedAt is missing' };
  if (r.deletedAt !== undefined && r.deletedAt !== null && (typeof r.deletedAt !== 'string' || !r.deletedAt)) return { ok: false, reason: 'record.deletedAt must be a timestamp' };
  if (table === 'settings' && r.deletedAt) return { ok: false, reason: 'settings cannot be deleted' };
  if (!Number.isInteger(baseRev) || baseRev < 0) return { ok: false, reason: 'baseRev must be a non-negative integer' };
  return { ok: true, table, id, record: record as Record<string, unknown>, baseRev };
}

// Equality for the "unchanged" fast path. `updatedAt` is excluded (it changes on every save, so including it would turn a
// harmless re-push into a conflict) but the deleted/not-deleted bit is kept: a live record and its own tombstone must never
// compare equal, or a delete would be silently dropped as "unchanged".
const same = (a: unknown, b: unknown) => {
  const strip = (v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const { updatedAt: _u, deletedAt, ...rest } = v as Record<string, unknown>;
      return { ...rest, __deleted: deletedAt ? 1 : 0 };
    }
    return v;
  };
  return JSON.stringify(sortKeys(strip(a))) === JSON.stringify(sortKeys(strip(b)));
};
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)]));
  return v;
}

export function applyPush(store: Store, who: { userId: string; deviceId: string | null }, changes: unknown[]): PushResult[] {
  return store.tx(() => changes.map((raw): PushResult => {
    const v = validateChange(raw);
    if (!v.ok) {
      const c = (raw ?? {}) as Partial<PushChange>;
      return { table: String(c.table), id: String(c.id), status: 'rejected', reason: v.reason };
    }
    const record = redact(v.table, v.record);
    const current = store.getRecord(v.table, v.id);
    if (current && current.rev !== v.baseRev) {
      if (same(current.record, record)) return { table: v.table, id: v.id, status: 'unchanged', rev: current.rev };
      return { table: v.table, id: v.id, status: 'conflict', rev: current.rev, serverRecord: current.record };
    }
    if (current && same(current.record, record)) return { table: v.table, id: v.id, status: 'unchanged', rev: current.rev };
    const rev = store.putRecord(v.table, v.id, record, { userId: who.userId, deviceId: who.deviceId });
    return { table: v.table, id: v.id, status: 'accepted', rev };
  }));
}

export class BadRequest extends Error {}
export class Conflict extends Error {}

export interface ImportSummary { tables: Record<string, number>; total: number; rev: number }

/** The stores a native backup can hold, in the shape Settings > Data > Export writes them (arrays named like the stores). */
const LIST_TABLES = SYNC_TABLES.filter((t): t is Exclude<SyncTable, 'settings'> => t !== 'settings');

/** Turns one backup row into a wire record: adds the `id` the protocol needs (a meal-plan day's id is its date) and fills a
 * missing `updatedAt` from the backup's own timestamp, so old rows that never carried one still sync. */
function wireRecord(table: SyncTable, row: unknown, fallbackUpdatedAt: string): Record<string, unknown> | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = { ...(row as Record<string, unknown>) };
  if (table === 'mealPlanDays') r.id = r.date;
  if (table === 'settings') r.id = 'singleton';
  if (typeof r.updatedAt !== 'string' || !r.updatedAt) r.updatedAt = fallbackUpdatedAt;
  return r;
}

/** One-shot bootstrap from a native app backup (the JSON "Export > Full backup" writes; version 1). All-or-nothing. */
export function importBackup(store: Store, who: { userId: string }, data: unknown): ImportSummary {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadRequest('This is not a Meal Planner backup (top level is not an object).');
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'number' || d.version !== 1) throw new BadRequest('Unrecognized backup version.');
  const fallback = typeof d.exportedAt === 'string' && d.exportedAt ? d.exportedAt : new Date().toISOString();
  const tables: Record<string, number> = {};
  const staged: { table: SyncTable; id: string; record: Record<string, unknown> }[] = [];
  for (const table of SYNC_TABLES) {
    const raw = d[table];
    if (raw === undefined || raw === null) continue;
    const rows = table === 'settings' ? [raw] : raw;
    if (!Array.isArray(rows)) throw new BadRequest(`"${table}" is not a list.`);
    const seen = new Set<string>();
    for (const row of rows) {
      const record = wireRecord(table, row, fallback);
      const v = validateChange({ table, id: record?.id, record, baseRev: 0 });
      if (!v.ok) throw new BadRequest(`${table}: ${v.reason}`);
      if (seen.has(v.id)) throw new BadRequest(`${table}: duplicate id "${v.id}".`);
      seen.add(v.id);
      staged.push({ table, id: v.id, record: redact(table, v.record) });
    }
    tables[table] = rows.length;
  }
  if (staged.length === 0) throw new BadRequest(`The backup holds none of: ${LIST_TABLES.join(', ')}, settings.`);
  const rev = store.tx(() => {
    for (const s of staged) store.putRecord(s.table, s.id, s.record, { userId: who.userId, deviceId: 'import' });
    return store.currentRev();
  });
  return { tables, total: staged.length, rev };
}

export interface ReplaceSummary { upserted: number; tombstoned: number; rev: number; perTable: Record<string, { upserted: number; tombstoned: number }> }

/**
 * "This device holds the real data: make the server match it." Expressed in sync terms so every other device converges through
 * ordinary pulls:
 *   - every record in `changes` is written (new revision),
 *   - every LIVE server record that is not in `changes` becomes a tombstone, never physically erased.
 * All-or-nothing. Refused (Conflict) when the server has moved since the caller looked (`expectedRev`). The settings singleton
 * is never tombstoned. The route takes a database backup first.
 */
export function replaceAll(store: Store, who: { userId: string; deviceId: string | null }, changes: unknown[], expectedRev: unknown): ReplaceSummary {
  if (!Array.isArray(changes) || changes.length === 0) throw new BadRequest('There is nothing to replace the server data with.');
  if (!Number.isInteger(expectedRev) || (expectedRev as number) < 0) throw new BadRequest('expectedRev is required.');
  const staged: { table: SyncTable; id: string; record: Record<string, unknown> }[] = [];
  const keep = new Set<string>();
  for (const raw of changes) {
    const v = validateChange(raw);
    if (!v.ok) throw new BadRequest(`${String((raw as { table?: unknown })?.table)}/${String((raw as { id?: unknown })?.id)}: ${v.reason}`);
    const k = `${v.table}|${v.id}`;
    if (keep.has(k)) throw new BadRequest(`duplicate record ${k}`);
    keep.add(k);
    staged.push({ table: v.table, id: v.id, record: redact(v.table, v.record) });
  }
  return store.tx(() => {
    if (store.currentRev() !== expectedRev) {
      throw new Conflict(`The server changed since you looked (it is now at revision ${store.currentRev()}, you saw ${String(expectedRev)}). Nothing was changed; look again and retry.`);
    }
    const perTable: ReplaceSummary['perTable'] = {};
    const bump = (t: string, f: 'upserted' | 'tombstoned') => { (perTable[t] ??= { upserted: 0, tombstoned: 0 })[f]++; };
    let tombstoned = 0;
    for (const t of store.liveKeys()) {
      if (t.tbl === 'settings' || keep.has(`${t.tbl}|${t.id}`)) continue;
      const now = new Date().toISOString();
      store.putRecord(t.tbl, t.id, { id: t.id, updatedAt: now, deletedAt: now }, { userId: who.userId, deviceId: who.deviceId });
      bump(t.tbl, 'tombstoned'); tombstoned++;
    }
    for (const s of staged) { store.putRecord(s.table, s.id, s.record, { userId: who.userId, deviceId: who.deviceId }); bump(s.table, 'upserted'); }
    return { upserted: staged.length, tombstoned, rev: store.currentRev(), perTable };
  });
}
