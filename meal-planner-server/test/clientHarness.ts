// Test harness for the CLIENT sync engine (../../src/sync). Each "device" is a real StoreCore over an in-memory backing, a real
// ServerApi whose fetch is routed into the real server (Fastify inject), and a real SyncEngine -- so what is tested is the code
// that ships, against the code that ships.
import type { FastifyInstance } from 'fastify';
import { SyncEngine, type Transport } from '../../src/sync/engine.ts';
import { ServerApi, type TokenStore } from '../../src/sync/api.ts';
import { StoreCore, DATA_TABLES, type Backing, type ConflictRow, type Op } from '../../src/sync/storeCore.ts';
import { localKey, recordId, type LocalRec, type SyncTable } from '../../src/sync/records.ts';
import type { HeldDuplicate, SyncStateEntry } from '../../src/sync/engine.ts';
import { PW } from './helpers.js';

export function injectFetch(app: FastifyInstance): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'DELETE',
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body !== undefined ? { payload: init.body as string } : {}),
    });
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers.set(k, v);
    return new Response(res.rawPayload.length ? res.rawPayload : null, { status: res.statusCode, headers });
  }) as typeof fetch;
}

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

export interface Device {
  name: string;
  backing: MemoryBacking;
  store: StoreCore;
  api: ServerApi;
  engine: SyncEngine;
  clock: { t: number };
  /** Simulates the app's saveX(): stamps `updatedAt` = now and writes the plain record. */
  save(table: SyncTable, rec: LocalRec): Promise<LocalRec>;
  /** Simulates deleteX(): the row is really gone. */
  remove(table: SyncTable, id: string): Promise<void>;
  get(table: SyncTable, id: string): LocalRec | undefined;
  all(table: SyncTable): LocalRec[];
  signIn(username: string, password?: string): Promise<void>;
}

let tick = 0;
/** Strictly increasing fake wall clock, so "which edit is newer" is deterministic. */
export const nextTime = () => new Date(Date.UTC(2026, 10, 13, 12, 0, 0) + ++tick * 1000).toISOString();

export function makeDevice(app: FastifyInstance, name: string, opts: { settings?: LocalRec; transport?: (t: Transport) => Transport } = {}): Device {
  const backing = new MemoryBacking();
  backing.data.get('settings')!.set('app', { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) });
  let token: string | null = null;
  const tokens: TokenStore = { get: () => token, set: (t) => { token = t; } };
  const clock = { t: 0 };
  const store = new StoreCore(backing, { defaultSettings: DEFAULT_SETTINGS, now: nextTime });
  const api = new ServerApi(`dev-${name}`, { fetchFn: injectFetch(app), tokens });
  const engine = new SyncEngine(store, opts.transport ? opts.transport(api) : api, { pageSize: 300, now: nextTime });
  const d: Device = {
    name, backing, store, api, engine, clock,
    async save(table, rec) {
      const out = { ...rec, updatedAt: nextTime() };
      backing.data.get(table)!.set(localKey(table, recordId(table, out)!), out);
      return out;
    },
    async remove(table, id) { backing.data.get(table)!.delete(localKey(table, id)); },
    get: (table, id) => backing.data.get(table)!.get(localKey(table, id)),
    all: (table) => [...backing.data.get(table)!.values()],
    async signIn(username, password = PW) { await api.login(username, password); },
  };
  return d;
}

export const ingredient = (id: string, name: string, extra: LocalRec = {}): LocalRec => ({
  id, name, category: 'Produce', variants: [{ id: `${id}-v1`, brand: 'Generic', macros: { calories: 10, protein: 1, carbs: 2, fiber: 1, sugar: 1, fat: 0, sodium: 5 } }],
  createdAt: '2026-01-01T00:00:00.000Z', ...extra,
});
export const recipe = (id: string, name: string, extra: LocalRec = {}): LocalRec => ({ id, name, servings: 4, ingredients: [], steps: [], tags: [], ...extra });
