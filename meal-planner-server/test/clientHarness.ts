// Test harness for the CLIENT sync engine (../../src/sync). Each "device" is a real StoreCore over an in-memory backing, a real
// ServerApi whose fetch is routed into the real server (Fastify inject), and a real SyncEngine -- so what is tested is the code
// that ships, against the code that ships.
import type { FastifyInstance } from 'fastify';
import { SyncEngine, type Transport } from '../../src/sync/engine.ts';
import { ServerApi, type TokenStore } from '../../src/sync/api.ts';
import { StoreCore } from '../../src/sync/storeCore.ts';
import { localKey, recordId, type LocalRec, type SyncTable } from '../../src/sync/records.ts';
import { MemoryBacking, DEFAULT_SETTINGS } from './memoryBacking.ts';

export { MemoryBacking, DEFAULT_SETTINGS };
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
