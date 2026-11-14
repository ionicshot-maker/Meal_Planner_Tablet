/**
 * The IndexedDB side of the local sync store: raw reads, and one atomic `apply` (a single IndexedDB transaction over every store a
 * pull can touch, so a page of server changes lands completely or not at all). All of the logic is in storeCore.ts.
 */
import { getRawDB } from '../db/schema';
import type { HeldDuplicate, SyncStateEntry } from './engine';
import { DATA_TABLES, StoreCore, type Backing, type ConflictRow, type Op } from './storeCore';
import { localKey, type LocalRec, type SyncTable } from './records';

/** The conflict log is informational, not data to keep forever. Capped where entries are added, oldest dropped first. */
export const MAX_CONFLICTS = 500;

// The typed idb API is awkward for "any of these 8 stores by name"; the stores are known and checked by the tests, so use the
// untyped view for those calls only.
type AnyDB = {
  get(store: string, key: unknown): Promise<unknown>;
  getAll(store: string): Promise<unknown[]>;
  put(store: string, value: unknown, key?: unknown): Promise<unknown>;
  delete(store: string, key: unknown): Promise<void>;
  clear(store: string): Promise<void>;
  transaction(stores: string[], mode: 'readwrite' | 'readonly'): {
    objectStore(name: string): {
      get(key: unknown): Promise<unknown>; getAll(): Promise<unknown[]>; put(value: unknown, key?: unknown): Promise<unknown>;
      delete(key: unknown): Promise<void>; clear(): Promise<void>; count(): Promise<number>;
      index(name: string): { openCursor(): Promise<{ primaryKey: unknown; delete(): Promise<void>; continue(): Promise<unknown> } | null> };
    };
    done: Promise<void>;
  };
};

const ALL_STORES = [...DATA_TABLES, 'settings', 'syncState', 'syncMeta', 'syncConflicts', 'heldDuplicates'];

export class IdbBacking implements Backing {
  private db = () => getRawDB() as unknown as Promise<AnyDB>;

  async readAll(table: SyncTable): Promise<LocalRec[]> {
    const db = await this.db();
    if (table === 'settings') { const s = await db.get('settings', 'app'); return s ? [s as LocalRec] : []; }
    return (await db.getAll(table)) as LocalRec[];
  }

  async readMany(table: SyncTable, ids: string[]): Promise<(LocalRec | undefined)[]> {
    const db = await this.db();
    if (table === 'settings') return [(await db.get('settings', 'app')) as LocalRec | undefined];
    return Promise.all(ids.map((id) => db.get(table, localKey(table, id)) as Promise<LocalRec | undefined>));
  }

  async readState(keys: string[] | null): Promise<Map<string, SyncStateEntry>> {
    const db = await this.db();
    const rows = (keys === null
      ? await db.getAll('syncState')
      : (await Promise.all(keys.map((k) => db.get('syncState', k)))).filter(Boolean)) as { key: string; rev: number; hash: string; held?: boolean; deleted?: boolean }[];
    return new Map(rows.map((r) => [r.key, { rev: r.rev, hash: r.hash, ...(r.held ? { held: true } : {}), ...(r.deleted ? { deleted: true } : {}) }]));
  }

  async readMeta(key: string): Promise<unknown> {
    const db = await this.db();
    return ((await db.get('syncMeta', key)) as { value: unknown } | undefined)?.value;
  }

  async apply(ops: Op[]): Promise<void> {
    if (ops.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(ALL_STORES, 'readwrite');
    const st = (name: string) => tx.objectStore(name);
    let addedConflicts = false;
    try {
      for (const op of ops) {
        switch (op.op) {
          case 'put': await st(op.table).put(op.record, op.table === 'settings' ? 'app' : undefined); break;
          case 'delete': await st(op.table).delete(localKey(op.table, op.id)); break;
          case 'mergeSettings': {
            const merged = op.merge((await st('settings').get('app')) as LocalRec | undefined);
            await st('settings').put(merged, 'app');
            const entry = op.entry(merged);
            await st('syncState').put({ key: 'settings|singleton', ...entry });
            break;
          }
          case 'state': await st('syncState').put({ key: op.key, ...op.entry }); break;
          case 'stateDelete': await st('syncState').delete(op.key); break;
          case 'meta': await st('syncMeta').put({ key: op.key, value: op.value }); break;
          case 'conflict':
            await st('syncConflicts').put({ at: op.row.at, table: op.row.table, recordId: op.row.id, kept: op.row.kept, local: op.row.local, server: op.row.server });
            addedConflicts = true;
            break;
          case 'held': await st('heldDuplicates').put(op.row); break;
          case 'heldDelete': await st('heldDuplicates').delete(op.key); break;
          case 'clearData': for (const t of DATA_TABLES) await st(t).clear(); break;
          case 'clearState': await st('syncState').clear(); break;
          case 'clearMeta': {
            const keep = (await st('syncMeta').get('deviceId')) as { key: string; value: unknown } | undefined;
            await st('syncMeta').clear();
            if (keep) await st('syncMeta').put(keep);
            break;
          }
          case 'clearHeld': await st('heldDuplicates').clear(); break;
        }
      }
      if (addedConflicts) {
        const excess = (await st('syncConflicts').count()) - MAX_CONFLICTS;
        if (excess > 0) {
          let cur = await st('syncConflicts').index('by-at').openCursor();
          for (let i = 0; cur && i < excess; i++) { await cur.delete(); cur = (await cur.continue()) as typeof cur; }
        }
      }
    } catch (e) {
      try { (tx as unknown as { abort(): void }).abort(); } catch { /* already finished */ }
      tx.done.catch(() => {});
      throw e;
    }
    await tx.done;
  }

  async listConflicts(limit: number): Promise<ConflictRow[]> {
    const db = await this.db();
    const rows = (await db.getAll('syncConflicts')) as ConflictRow[];
    return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id)).slice(0, limit);
  }
  async conflictCount(): Promise<number> {
    const db = await this.db();
    return (await db.getAll('syncConflicts')).length;
  }
  async listHeld(): Promise<HeldDuplicate[]> {
    const db = await this.db();
    return ((await db.getAll('heldDuplicates')) as HeldDuplicate[]).sort((a, b) => (a.at < b.at ? -1 : 1));
  }
  async getHeld(key: string): Promise<HeldDuplicate | undefined> {
    const db = await this.db();
    return (await db.get('heldDuplicates', key)) as HeldDuplicate | undefined;
  }

  // ---- used by the UI layer on top of the store ----
  async dismissConflict(id: number) { await (await this.db()).delete('syncConflicts', id); }
  async clearAllConflicts() { await (await this.db()).clear('syncConflicts'); }

  /** This device's stable id (sent with pushes so the server can say which device wrote what). Created on first use. */
  async deviceId(): Promise<string> {
    const db = await this.db();
    const cur = (await db.get('syncMeta', 'deviceId')) as { value: string } | undefined;
    if (cur?.value) return cur.value;
    const id = crypto.randomUUID();
    await db.put('syncMeta', { key: 'deviceId', value: id });
    return id;
  }
}

/** The app's local sync store: all the logic (storeCore.ts) over IndexedDB. */
export function createSyncStore(defaultSettings: LocalRec) {
  const backing = new IdbBacking();
  return { core: new StoreCore(backing, { defaultSettings }), backing };
}
