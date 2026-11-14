/**
 * All of the local sync store's LOGIC, written against a tiny `Backing` (raw reads + one atomic `apply`). The app plugs in an
 * IndexedDB backing (idbBacking.ts); the tests plug in an in-memory one. Keeping the logic here means the delete-detection,
 * dirty-detection and plan-application rules are exercised by the same tests that exercise the engine.
 *
 * Local records are written back RAW: a pulled record keeps the `updatedAt` it had on the server. (Going through the app's
 * `saveX()` functions would stamp "now" on it, make it look like a fresh local edit, and bounce it straight back.)
 */
import {
  deletionChange, heldState, stateAfterPush,
  type ConflictLog, type DirtyChange, type HeldDuplicate, type LocalStore, type LocalView, type PullPlan, type SyncStateEntry,
} from './engine';
import {
  contentHash, DELETED_HASH, fromWire, localKey, normName, recordId, SYNC_TABLES, SYNCED_SETTINGS_KEYS, toWire,
  type LocalRec, type SyncTable, type WireRec,
} from './records';

export const DATA_TABLES = SYNC_TABLES.filter((t): t is Exclude<SyncTable, 'settings'> => t !== 'settings');

/** One recorded conflict, as the UI lists it. */
export interface ConflictRow extends Omit<ConflictLog, 'id'> { id: number; recordId: string }

export type Op =
  | { op: 'put'; table: SyncTable; record: LocalRec }
  | { op: 'delete'; table: SyncTable; id: string }
  /** Read the settings row, merge the server's synced fields into it, write it, and remember the resulting state -- atomically. */
  | { op: 'mergeSettings'; merge: (current: LocalRec | undefined) => LocalRec; entry: (merged: LocalRec) => SyncStateEntry }
  | { op: 'state'; key: string; entry: SyncStateEntry }
  | { op: 'stateDelete'; key: string }
  | { op: 'meta'; key: string; value: unknown }
  | { op: 'conflict'; row: ConflictLog }
  | { op: 'held'; row: HeldDuplicate }
  | { op: 'heldDelete'; key: string }
  | { op: 'clearData' }          // every data table except settings
  | { op: 'clearState' }
  | { op: 'clearMeta' }          // everything except the device id
  | { op: 'clearHeld' };

export interface Backing {
  readAll(table: SyncTable): Promise<LocalRec[]>;
  /** By server id. For `settings` the id is ignored and the single row is returned. */
  readMany(table: SyncTable, ids: string[]): Promise<(LocalRec | undefined)[]>;
  /** The remembered state for these keys (`table|id`), or for every key when `keys` is null. */
  readState(keys: string[] | null): Promise<Map<string, SyncStateEntry>>;
  readMeta(key: string): Promise<unknown>;
  /** Applies all ops in order, atomically: all of them land or none do. */
  apply(ops: Op[]): Promise<void>;
  listConflicts(limit: number): Promise<ConflictRow[]>;
  conflictCount(): Promise<number>;
  listHeld(): Promise<HeldDuplicate[]>;
  getHeld(key: string): Promise<HeldDuplicate | undefined>;
}

const k = (table: string, id: string) => `${table}|${id}`;

export class StoreCore implements LocalStore {
  private readonly b: Backing;
  private readonly defaults: LocalRec;
  private readonly now: () => string;

  constructor(backing: Backing, opts: { defaultSettings: LocalRec; now?: () => string }) {
    this.b = backing;
    this.defaults = opts.defaultSettings;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  // ---- meta ----
  async getCursor() { return ((await this.b.readMeta('cursor')) as number | undefined) ?? 0; }
  async getSeenRev() { return ((await this.b.readMeta('seen')) as number | undefined) ?? 0; }
  async noteServerRev(rev: number) {
    if (rev > (await this.getSeenRev())) await this.b.apply([{ op: 'meta', key: 'seen', value: rev }]);
  }
  async getEpoch() { return (await this.b.readMeta('epoch')) as string | undefined; }
  async noteEpoch(epoch: string) { await this.b.apply([{ op: 'meta', key: 'epoch', value: epoch }]); }
  async isNeverSynced() {
    return (await this.b.readMeta('cursor')) === undefined && (await this.b.readState(null)).size === 0;
  }

  // ---- reading a local view ----
  async getMany(keys: { table: SyncTable; id: string }[]): Promise<Map<string, LocalView>> {
    const out = new Map<string, LocalView>();
    const states = await this.b.readState(keys.map((x) => k(x.table, x.id)));
    const byTable = new Map<SyncTable, string[]>();
    for (const x of keys) (byTable.get(x.table) ?? byTable.set(x.table, []).get(x.table)!).push(x.id);
    for (const [table, ids] of byTable) {
      const rows = await this.b.readMany(table, ids);
      ids.forEach((id, i) => {
        const row = rows[i];
        const record = row ? toWire(table, row) : undefined;
        const state = states.get(k(table, id));
        out.set(k(table, id), {
          record,
          state,
          dirty: !!record && (!state || state.hash !== contentHash(record)),
          dirtyDelete: !record && !!state && !state.held && !state.deleted && table !== 'settings',
        });
      });
    }
    return out;
  }

  async listDirty(): Promise<DirtyChange[]> {
    const states = await this.b.readState(null);
    const seen = new Set<string>();
    const dirty: DirtyChange[] = [];
    for (const table of SYNC_TABLES) {
      for (const row of await this.b.readAll(table)) {
        const wire = toWire(table, row);
        if (!wire) continue;
        const key = k(table, wire.id);
        seen.add(key);
        const s = states.get(key);
        if (!s || s.hash !== contentHash(wire)) dirty.push({ table, id: wire.id, record: wire, baseRev: s?.rev ?? 0, isDelete: false });
      }
    }
    const at = this.now();
    for (const [key, s] of states) {
      if (seen.has(key) || s.held || s.deleted) continue;
      const [table, ...rest] = key.split('|');
      if (table === 'settings') continue; // the one record that can never be deleted
      dirty.push(deletionChange(table as SyncTable, rest.join('|'), s.rev, at));
    }
    return dirty;
  }

  async trackedCounts() {
    const out: Record<string, number> = {};
    for (const [key, s] of await this.b.readState(null)) {
      if (s.held || s.deleted) continue;
      const table = key.slice(0, key.indexOf('|'));
      out[table] = (out[table] ?? 0) + 1;
    }
    return out;
  }

  async nameIndex(table: SyncTable) {
    const idx = new Map<string, string>();
    for (const row of await this.b.readAll(table)) {
      const id = recordId(table, row);
      const name = normName(row.name);
      if (id && name && !idx.has(name)) idx.set(name, id);
    }
    return idx;
  }

  // ---- applying a pull ----
  async commitPull(plan: PullPlan, cursor: number | null) {
    const ops: Op[] = [];
    const cur = plan.keepLocal.length ? await this.b.readState(plan.keepLocal.map((x) => k(x.table, x.id))) : new Map<string, SyncStateEntry>();
    for (const r of plan.adopt) {
      const key = k(r.table, r.id);
      if (r.deleted) {
        if (r.table !== 'settings') ops.push({ op: 'delete', table: r.table, id: r.id });
        ops.push({ op: 'state', key, entry: { rev: r.rev, hash: DELETED_HASH, deleted: true } });
      } else if (r.table === 'settings') {
        ops.push({
          op: 'mergeSettings',
          merge: (current) => mergeSettings(current ?? this.defaults, r.record),
          entry: (merged) => ({ rev: r.rev, hash: contentHash(toWire('settings', merged)!) }),
        });
      } else {
        ops.push({ op: 'put', table: r.table, record: fromWire(r.table, r.record) });
        ops.push({ op: 'state', key, entry: { rev: r.rev, hash: contentHash(r.record) } });
      }
      ops.push({ op: 'heldDelete', key }); // adopting a record settles any hold on it
    }
    for (const x of plan.keepLocal) {
      // keep the old hash (the local edit/deletion stays pending); only move the revision it will be pushed against
      ops.push({ op: 'state', key: k(x.table, x.id), entry: { rev: x.rev, hash: cur.get(k(x.table, x.id))?.hash ?? '' } });
    }
    for (const c of plan.conflicts) ops.push({ op: 'conflict', row: c });
    for (const h of plan.hold) {
      ops.push({ op: 'held', row: h });
      ops.push({ op: 'state', key: h.key, entry: heldState(h.rev) });
    }
    for (const key of plan.releaseHeld) ops.push({ op: 'heldDelete', key });
    if (cursor !== null) ops.push({ op: 'meta', key: 'cursor', value: cursor });
    if (ops.length) await this.b.apply(ops);
  }

  async markPushed(items: { table: SyncTable; id: string; rev: number; record: WireRec }[]) {
    await this.b.apply(items.map((i) => ({ op: 'state' as const, key: k(i.table, i.id), entry: stateAfterPush(i.rev, i.record) })));
  }

  // ---- resets ----
  async wipeForAdopt() {
    // A HARD clear on purpose: this is "forget everything and take the server's copy", not a user deleting things. (Tombstoning
    // here would be pushed to the server as deletes.) The settings row stays: it carries this device's own keys and preferences;
    // the first pull overwrites only its shared fields.
    await this.b.apply([{ op: 'clearData' }, { op: 'clearState' }, { op: 'clearMeta' }, { op: 'clearHeld' }]);
  }
  async resetSyncState() {
    await this.b.apply([{ op: 'clearState' }, { op: 'clearMeta' }, { op: 'clearHeld' }]);
  }

  async forgetLocalDeletions() {
    const gone = (await this.listDirty()).filter((d) => d.isDelete);
    const ops: Op[] = gone.map((d) => ({ op: 'stateDelete' as const, key: k(d.table, d.id) }));
    ops.push({ op: 'meta', key: 'cursor', value: 0 });
    await this.b.apply(ops);
    return gone.length;
  }

  // ---- duplicate review ----
  listHeld(): Promise<HeldDuplicate[]> { return this.b.listHeld(); }
  getHeld(key: string) { return this.b.getHeld(key); }
  /** Settles a held duplicate: drops the hold and optionally records a new state for the record. Used by resolveDuplicate. */
  async settleHeld(key: string, entry?: SyncStateEntry) {
    const ops: Op[] = [{ op: 'heldDelete', key }];
    if (entry) ops.push({ op: 'state', key, entry });
    await this.b.apply(ops);
  }

  // ---- conflict log ----
  listConflicts(limit = 50) { return this.b.listConflicts(limit); }
  conflictCount() { return this.b.conflictCount(); }
}

/** The server's synced settings folded into this device's settings; everything device-local is untouched. */
export function mergeSettings(base: LocalRec, wire: WireRec): LocalRec {
  const out: LocalRec = { ...base };
  for (const key of SYNCED_SETTINGS_KEYS) if (key in wire) out[key] = wire[key];
  if (typeof wire.aiProvider === 'string') out.ai = { ...((base.ai as object | undefined) ?? {}), provider: wire.aiProvider };
  out.updatedAt = wire.updatedAt;
  return out;
}

/** Shared by backings: the key a data record lives under. */
export { localKey };
