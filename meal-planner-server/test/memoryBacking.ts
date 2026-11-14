// An in-memory implementation of the client sync store's Backing (src/sync/storeCore.ts). The engine tests run on it, and so does
// scripts/verify-join.ts, so "a device joining the household" is checked with the very same code in both places.
import { DATA_TABLES, type Backing, type ConflictRow, type Op } from '../../src/sync/storeCore.ts';
import { localKey, recordId, type LocalRec, type SyncTable } from '../../src/sync/records.ts';
import type { HeldDuplicate, SyncStateEntry } from '../../src/sync/engine.ts';

export class MemoryBacking implements Backing {
  data = new Map<SyncTable, Map<string, LocalRec>>(DATA_TABLES.concat(['settings' as never]).map((t) => [t as SyncTable, new Map()]));
  state = new Map<string, SyncStateEntry>();
  meta = new Map<string, unknown>();
  conflicts: ConflictRow[] = [];
  held = new Map<string, HeldDuplicate>();
  private nextId = 1;
  /** Number of times `apply` ran (to check that one pull page is one atomic commit). */
  applyCalls = 0;
  /** Make the next apply fail halfway, to prove atomicity. */
  failNextApplyAfter: number | null = null;

  async readAll(table: SyncTable) { return [...this.data.get(table)!.values()]; }
  async readMany(table: SyncTable, ids: string[]) {
    const t = this.data.get(table)!;
    return ids.map((id) => t.get(localKey(table, id)));
  }
  async readState(keys: string[] | null) {
    if (keys === null) return new Map(this.state);
    return new Map(keys.filter((k) => this.state.has(k)).map((k) => [k, this.state.get(k)!]));
  }
  async readMeta(key: string) { return this.meta.get(key); }
  async apply(ops: Op[]) {
    this.applyCalls++;
    const snap = {
      data: new Map([...this.data].map(([t, m]) => [t, new Map(m)])), state: new Map(this.state), meta: new Map(this.meta),
      conflicts: [...this.conflicts], held: new Map(this.held),
    };
    try {
      let n = 0;
      for (const op of ops) {
        if (this.failNextApplyAfter !== null && n++ >= this.failNextApplyAfter) { this.failNextApplyAfter = null; throw new Error('simulated crash mid-commit'); }
        this.run(op);
      }
    } catch (e) {
      Object.assign(this, snap);
      throw e;
    }
  }
  private run(op: Op) {
    switch (op.op) {
      case 'put': this.data.get(op.table)!.set(localKey(op.table, recordId(op.table, op.record)!), op.record); break;
      case 'delete': this.data.get(op.table)!.delete(localKey(op.table, op.id)); break;
      case 'mergeSettings': {
        const t = this.data.get('settings')!;
        const merged = op.merge(t.get('app'));
        t.set('app', merged);
        this.state.set('settings|singleton', op.entry(merged));
        break;
      }
      case 'state': this.state.set(op.key, op.entry); break;
      case 'stateDelete': this.state.delete(op.key); break;
      case 'meta': this.meta.set(op.key, op.value); break;
      case 'conflict': this.conflicts.push({ id: this.nextId++, recordId: op.row.id, table: op.row.table, at: op.row.at, kept: op.row.kept, local: op.row.local, server: op.row.server }); break;
      case 'held': this.held.set(op.row.key, op.row); break;
      case 'heldDelete': this.held.delete(op.key); break;
      case 'clearData': for (const t of DATA_TABLES) this.data.get(t)!.clear(); break;
      case 'clearState': this.state.clear(); break;
      case 'clearMeta': { const keep = this.meta.get('deviceId'); this.meta.clear(); if (keep !== undefined) this.meta.set('deviceId', keep); break; }
      case 'clearHeld': this.held.clear(); break;
    }
  }
  async listConflicts(limit: number) { return [...this.conflicts].reverse().slice(0, limit); }
  async conflictCount() { return this.conflicts.length; }
  async listHeld() { return [...this.held.values()]; }
  async getHeld(key: string) { return this.held.get(key); }
}

export const DEFAULT_SETTINGS: LocalRec = {
  householdName: '', unitSystem: 'imperial', fontSizePt: 14, geminiApiKey: '', geminiModel: 'gemini-3.1-flash-lite',
  ai: { provider: 'gemini', apiKey: '' }, setupComplete: false, people: [], stores: [], brands: [], updatedAt: '1970-01-01T00:00:00.000Z',
};

