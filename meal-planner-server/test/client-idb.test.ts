// Tests the app's real IndexedDB backing (src/sync/idbBacking.ts) on fake-indexeddb: first that it behaves exactly like the
// in-memory backing the engine tests use, then that a real engine on IndexedDB syncs correctly with the real server.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdbBacking } from '../../src/sync/idbBacking.ts';
import { getDB } from '../../src/db/schema.ts';
import { SyncEngine } from '../../src/sync/engine.ts';
import { ServerApi, type TokenStore } from '../../src/sync/api.ts';
import { StoreCore, type Op } from '../../src/sync/storeCore.ts';
import { localKey, type LocalRec, type SyncTable } from '../../src/sync/records.ts';
import { makeServer, setupOwner, call } from './helpers.js';
import { MemoryBacking, injectFetch, makeDevice, nextTime, DEFAULT_SETTINGS, ingredient, recipe } from './clientHarness.ts';

// getDB() in the app caches its connection at module level, so tests that need a clean database run against ONE database and
// clean it explicitly between uses instead of swapping factories.
async function wipeAll() {
  const db = await getDB();
  for (const s of Array.from(db.objectStoreNames)) await db.clear(s as never);
}

const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)])) : v;
const J = (v: unknown) => JSON.stringify(sortKeys(v));
const rows = async (b: { readAll(t: SyncTable): Promise<LocalRec[]> }, t: SyncTable) => (await b.readAll(t)).map((r) => J(r)).sort();

async function snapshot(b: IdbBacking | MemoryBacking) {
  const out: Record<string, unknown> = {};
  for (const t of ['ingredients', 'recipes', 'mealPlanDays', 'groceryLists', 'householdItems', 'collections', 'references', 'settings'] as SyncTable[]) out[t] = await rows(b, t);
  out.state = JSON.stringify([...(await b.readState(null))].sort(([x], [y]) => (x < y ? -1 : 1)));
  for (const m of ['cursor', 'seen', 'epoch', 'deviceId']) out[`meta:${m}`] = await b.readMeta(m);
  out.conflicts = J((await b.listConflicts(1000)).map(({ id: _i, ...r }) => r));
  out.held = J((await b.listHeld()).sort((x, y) => (x.key < y.key ? -1 : 1)));
  return out;
}

const script = (): Op[][] => [
  [
    { op: 'put', table: 'ingredients', record: ingredient('i1', 'Butter', { updatedAt: '2026-11-01T00:00:00.000Z' }) },
    { op: 'put', table: 'recipes', record: recipe('r1', 'Pancakes', { updatedAt: '2026-11-01T00:00:00.000Z' }) },
    { op: 'put', table: 'mealPlanDays', record: { date: '2026-11-14', meals: [], updatedAt: '2026-11-01T00:00:00.000Z' } },
    { op: 'put', table: 'groceryLists', record: { id: 'g1', name: 'Weekly', generatedAt: '2026-11-01T00:00:00.000Z' } },
    { op: 'put', table: 'collections', record: { id: 'c1', name: 'Dinners' } },
    { op: 'put', table: 'references', record: { id: 'x1', title: 'Temps' } },
    { op: 'put', table: 'householdItems', record: { id: 'h1', name: 'Soap' } },
    { op: 'put', table: 'settings', record: { ...DEFAULT_SETTINGS, householdName: 'Angelo', fontSizePt: 18, updatedAt: '2026-11-01T00:00:00.000Z' } },
    { op: 'state', key: 'ingredients|i1', entry: { rev: 3, hash: 'abc' } },
    { op: 'state', key: 'recipes|r1', entry: { rev: 4, hash: 'def', deleted: true } },
    { op: 'state', key: 'ingredients|held1', entry: { rev: 5, hash: 'held', held: true } },
    { op: 'meta', key: 'cursor', value: 7 }, { op: 'meta', key: 'seen', value: 9 }, { op: 'meta', key: 'epoch', value: 'e1' }, { op: 'meta', key: 'deviceId', value: 'dev-x' },
    { op: 'held', row: { key: 'ingredients|held1', table: 'ingredients', cloudId: 'held1', localId: 'i1', rev: 5, cloud: { id: 'held1', updatedAt: 't', name: 'butter' }, at: '2026-11-01T00:00:00.000Z' } },
    { op: 'conflict', row: { table: 'recipes', id: 'r1', at: '2026-11-02T00:00:00.000Z', kept: 'local', local: { id: 'r1', updatedAt: 'a' }, server: { id: 'r1', updatedAt: 'b' } } },
  ],
  [
    { op: 'mergeSettings', merge: (cur) => ({ ...(cur ?? {}), householdName: 'Merged', stores: ['Aldi'], ai: { provider: 'ollama', apiKey: 'keep' }, updatedAt: '2026-11-03T00:00:00.000Z' }), entry: (m) => ({ rev: 11, hash: `h-${String(m.householdName)}` }) },
    { op: 'delete', table: 'recipes', id: 'r1' },
    { op: 'delete', table: 'mealPlanDays', id: '2026-11-14' },
    { op: 'stateDelete', key: 'ingredients|held1' },
    { op: 'heldDelete', key: 'ingredients|held1' },
  ],
  [{ op: 'clearMeta' }],
  [{ op: 'clearState' }, { op: 'clearHeld' }],
  [{ op: 'clearData' }],
];

test('IndexedDB backing behaves exactly like the in-memory backing, op for op', async () => {
  await wipeAll();
  const idb = new IdbBacking();
  const mem = new MemoryBacking();
  for (const ops of script()) {
    await idb.apply(ops);
    await mem.apply(ops);
    assert.deepEqual(await snapshot(idb), await snapshot(mem), `diverged after ${ops.map((o) => o.op).join(',')}`);
  }
  // spot-check what the script ended with: clearMeta kept the device id, clearData kept settings
  assert.equal(await idb.readMeta('deviceId'), 'dev-x');
  assert.equal((await idb.readAll('settings')).length, 1);
  assert.equal((await idb.readAll('ingredients')).length, 0);
});

test('IndexedDB: a failing op rolls the WHOLE transaction back, like the engine requires', async () => {
  await wipeAll();
  const b = new IdbBacking();
  await b.apply([{ op: 'put', table: 'recipes', record: recipe('keep', 'Keep me', { updatedAt: 't' }) }, { op: 'meta', key: 'cursor', value: 1 }]);
  await assert.rejects(() => b.apply([
    { op: 'put', table: 'recipes', record: recipe('new', 'Half applied?', { updatedAt: 't' }) },
    { op: 'meta', key: 'cursor', value: 99 },
    { op: 'mergeSettings', merge: () => { throw new Error('boom'); }, entry: () => ({ rev: 1, hash: 'x' }) },
  ]), /boom/);
  assert.deepEqual((await b.readAll('recipes')).map((r) => r.id), ['keep']);
  assert.equal(await b.readMeta('cursor'), 1);
});

test('IndexedDB: the conflict log is capped (oldest dropped first) and can be listed newest-first', async () => {
  await wipeAll();
  const b = new IdbBacking();
  const make = (i: number): Op => ({ op: 'conflict', row: { table: 'recipes', id: `r${i}`, at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), kept: 'server', local: null, server: { id: `r${i}`, updatedAt: 'x' } } });
  await b.apply(Array.from({ length: 520 }, (_, i) => make(i)));
  assert.equal(await b.conflictCount(), 500);
  const newest = await b.listConflicts(3);
  assert.deepEqual(newest.map((c) => c.recordId), ['r519', 'r518', 'r517']);
  const oldestKept = (await b.listConflicts(1000)).at(-1)!;
  assert.equal(oldestKept.recordId, 'r20');
  await b.dismissConflict(newest[0].id);
  assert.equal(await b.conflictCount(), 499);
  await b.clearAllConflicts();
  assert.equal(await b.conflictCount(), 0);
});

test('IndexedDB: the device id is created once and survives resets', async () => {
  await wipeAll();
  const b = new IdbBacking();
  const id = await b.deviceId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(await b.deviceId(), id);
  await b.apply([{ op: 'clearMeta' }]);
  assert.equal(await b.deviceId(), id);
});

// ---------------------------------------------------------------- a real engine on IndexedDB
test('a real engine on IndexedDB syncs with the real server and a second device, both ways, with nothing re-stamped', async () => {
  await wipeAll();
  const s = makeServer();
  const owner = await setupOwner(s.app);

  // Device I: the app's real storage (fake IndexedDB). Raw writes stand in for the app's saveX().
  const idb = new IdbBacking();
  const db = await getDB();
  let token: string | null = null;
  const tokens: TokenStore = { get: () => token, set: (t) => { token = t; } };
  const api = new ServerApi('idb-device', { fetchFn: injectFetch(s.app), tokens });
  await api.login('michael', 'correct horse battery');
  const store = new StoreCore(idb, { defaultSettings: DEFAULT_SETTINGS, now: nextTime });
  const engine = new SyncEngine(store, api, { now: nextTime });

  await db.put('settings', { ...DEFAULT_SETTINGS, householdName: 'Angelo Family', fontSizePt: 19, geminiApiKey: 'IDB-KEY', updatedAt: nextTime() } as never, 'app');
  const stamp = nextTime();
  await db.put('ingredients', { ...ingredient('i1', 'Butter'), updatedAt: stamp } as never);
  await db.put('recipes', { ...recipe('r1', 'Pancakes'), updatedAt: stamp } as never);
  await db.put('mealPlanDays', { date: '2026-11-14', meals: [{ slot: 'dinner' }], updatedAt: stamp } as never);
  const first = await engine.syncOnce();
  assert.equal(first.status, 'ok');
  assert.equal(first.pushed, 4);

  // Device M (memory) adopts, edits, and syncs back
  const M = makeDevice(s.app, 'M');
  await M.signIn('michael');
  assert.equal((await M.engine.syncOnce()).status, 'needs-adopt');
  await M.engine.adoptServerData();
  assert.equal(M.get('ingredients', 'i1')!.updatedAt, stamp);
  assert.equal('id' in M.get('mealPlanDays', '2026-11-14')!, false);
  await M.save('recipes', { ...M.get('recipes', 'r1')!, name: 'Pancakes v2' });
  await M.save('settings', { ...M.get('settings', 'singleton')!, stores: ['Aldi'] });
  await M.save('ingredients', ingredient('m-honey', 'Honey'));
  await M.engine.syncOnce();

  // Back on the IndexedDB device: edits arrive raw, settings merge into the single 'app' row, device-local values untouched
  const back = await engine.syncOnce();
  assert.equal(back.status, 'ok');
  assert.equal(back.pulled, 3);
  assert.equal(back.changedLocal, true);
  assert.equal(((await db.get('recipes', 'r1')) as { name: string }).name, 'Pancakes v2');
  assert.equal(((await db.get('ingredients', 'm-honey')) as { name: string }).name, 'Honey');
  const settings = (await db.get('settings', 'app')) as Record<string, unknown>;
  assert.deepEqual(settings.stores, ['Aldi']);
  assert.equal(settings.householdName, 'Angelo Family');
  assert.equal(settings.fontSizePt, 19);
  assert.equal(settings.geminiApiKey, 'IDB-KEY');
  assert.equal((await db.getAll('settings')).length, 1, 'still exactly one settings row, under the key "app"');

  // a delete on the IndexedDB device (a real row removal) travels as a tombstone
  await db.delete('recipes', 'r1');
  assert.equal((await engine.syncOnce()).pushed, 1);
  await M.engine.syncOnce();
  assert.equal(M.get('recipes', 'r1'), undefined);
  const idle = await engine.syncOnce();
  assert.deepEqual([idle.pushed, idle.pulled], [0, 0]);

  // the sync stores never leak into data tables, and the server never saw the device's key
  const serverSettings = (await call(s.app, 'GET', '/api/sync/pull?since=0&limit=100', { token: owner.token })).json.records.find((r: any) => r.table === 'settings').record;
  assert.doesNotMatch(JSON.stringify(serverSettings), /IDB-KEY/);
  void localKey;
});

test('a held duplicate persists in IndexedDB across store instances (a page reload)', async () => {
  await wipeAll();
  const s = makeServer();
  await setupOwner(s.app);
  const A = makeDevice(s.app, 'A');
  await A.signIn('michael');
  await A.save('ingredients', ingredient('a-1', 'Oregano'));
  await A.engine.syncOnce();

  const idb = new IdbBacking();
  const db = await getDB();
  let token: string | null = null;
  const api = new ServerApi('idb', { fetchFn: injectFetch(s.app), tokens: { get: () => token, set: (t) => { token = t; } } });
  await api.login('michael', 'correct horse battery');
  await db.put('settings', { ...DEFAULT_SETTINGS } as never, 'app');
  await db.put('ingredients', { ...ingredient('b-1', 'oregano'), updatedAt: nextTime() } as never);
  const engine = new SyncEngine(new StoreCore(idb, { defaultSettings: DEFAULT_SETTINGS, now: nextTime }), api, { now: nextTime });
  assert.equal((await engine.syncOnce()).status, 'needs-adopt'); // fresh device on a populated server
  // make it a device that has synced before, without adopting (so its own records are kept and name-matched)
  await new StoreCore(idb, { defaultSettings: DEFAULT_SETTINGS }).resetSyncState();
  await idb.apply([{ op: 'meta', key: 'cursor', value: 0 }]);
  const out = await engine.syncOnce();
  assert.equal(out.held, 1);
  const reloaded = new StoreCore(new IdbBacking(), { defaultSettings: DEFAULT_SETTINGS });
  const held = await reloaded.listHeld();
  assert.deepEqual(held.map((h) => [h.cloudId, h.localId]), [['a-1', 'b-1']]);
});

// ---------------------------------------------------------------- the change signal
import { onLocalChange } from '../../src/sync/changeSignal.ts';

test('the app\'s database raises a change signal for every kind of write to synced data, and for nothing else', async () => {
  await wipeAll();
  const db = await getDB();
  let n = 0;
  const off = onLocalChange(() => { n++; });
  const expectBump = async (label: string, fn: () => Promise<unknown>) => { const before = n; await fn(); assert.equal(n, before + 1, `${label} should signal once`); };
  const expectQuiet = async (label: string, fn: () => Promise<unknown>) => { const before = n; await fn(); await new Promise((r) => setTimeout(r, 5)); assert.equal(n, before, `${label} should not signal`); };
  try {
    await expectBump('put', () => db.put('recipes', recipe('r1', 'Pancakes') as never));
    await expectBump('add', () => db.add('groceryLists', { id: 'g1', name: 'x', generatedAt: 't' } as never));
    await expectBump('delete', () => db.delete('recipes', 'r1'));
    await expectBump('clear', () => db.clear('householdItems'));
    await expectBump('settings put', () => db.put('settings', { ...DEFAULT_SETTINGS } as never, 'app'));
    await expectBump('readwrite transaction (bulk paths like reset/import/merge)', async () => {
      const tx = db.transaction(['ingredients', 'recipes'], 'readwrite');
      await tx.objectStore('ingredients').put(ingredient('i1', 'Butter') as never);
      await tx.done;
    });
    await expectQuiet('get / getAll', async () => { await db.get('recipes', 'nope'); await db.getAll('ingredients'); });
    await expectQuiet('readonly transaction', async () => { const tx = db.transaction('recipes', 'readonly'); await tx.store.getAll(); await tx.done; });
    await expectQuiet('local-only stores (never synced)', async () => { await db.put('mealPlanTemplates', { id: 't1' } as never); await db.put('macroLogs', { id: 'm1', date: 'd', personId: 'p' } as never); });
    await expectQuiet('sync bookkeeping', async () => { await db.put('syncMeta', { key: 'x', value: 1 }); await db.put('syncState', { key: 'a|b', rev: 1, hash: 'h' }); });
    await expectQuiet('an aborted transaction', async () => {
      const tx = db.transaction('recipes', 'readwrite');
      await tx.store.put(recipe('r2', 'Never lands') as never);
      tx.abort();
      await tx.done.catch(() => {});
    });
    // the engine's own writes go through the raw connection: applying a pull must not make the app think the user edited something
    await expectQuiet('the sync backing', () => new IdbBacking().apply([
      { op: 'put', table: 'recipes', record: recipe('pulled', 'Pulled from server', { updatedAt: 't' }) },
      { op: 'state', key: 'recipes|pulled', entry: { rev: 1, hash: 'h' } },
    ]));
    assert.equal(((await db.get('recipes', 'pulled')) as { name: string }).name, 'Pulled from server');
    assert.equal(((await db.get('recipes', 'r2')) as unknown), undefined);
  } finally { off(); }
});

// ---------------------------------------------------------------- duplicate resolution on the real app database
import { resolveHeldDuplicate } from '../../src/sync/duplicates.ts';
import { idbResolvePort } from '../../src/sync/duplicatePort.ts';

async function idbDeviceWithDuplicate() {
  await wipeAll();
  const s = makeServer();
  await setupOwner(s.app);
  const A = makeDevice(s.app, 'A');
  await A.signIn('michael');
  await A.save('ingredients', ingredient('a-1', 'Oregano', { variants: [{ id: 'a-1-v1', brand: 'Theirs', macros: { calories: 1, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 } }], defaultVariantId: 'a-1-v1' }));
  await A.engine.syncOnce();

  const idb = new IdbBacking();
  const db = await getDB();
  let token: string | null = null;
  const api = new ServerApi('idb', { fetchFn: injectFetch(s.app), tokens: { get: () => token, set: (t) => { token = t; } } });
  await api.login('michael', 'correct horse battery');
  await db.put('settings', { ...DEFAULT_SETTINGS } as never, 'app');
  await db.put('ingredients', { ...ingredient('b-1', 'oregano'), updatedAt: nextTime() } as never);
  await db.put('recipes', { ...recipe('r-b', 'Pasta sauce', { ingredients: [{ ingredientId: 'b-1', variantId: 'b-1-v1', quantity: 1 }] }), updatedAt: nextTime() } as never);
  await db.put('groceryLists', { id: 'gl', name: 'Weekly', generatedAt: 't', items: [{ ingredientId: 'b-1', variantId: 'b-1-v1' }], manualItems: [], remainderItems: [], updatedAt: nextTime() } as never);
  await db.put('macroLogs', { id: 'ml', date: '2026-11-13', personId: 'p', variantId: 'b-1-v1' } as never);
  await idb.apply([{ op: 'meta', key: 'cursor', value: 0 }]); // this device has synced before
  const store = new StoreCore(idb, { defaultSettings: DEFAULT_SETTINGS, now: nextTime });
  const engine = new SyncEngine(store, api, { now: nextTime });
  const out = await engine.syncOnce();
  assert.equal(out.held, 1);
  return { s, A, db, store, engine };
}

test('real database, "keep theirs": references to our copy are repointed in one transaction and our copy retires everywhere', async () => {
  const { s, A, db, store, engine } = await idbDeviceWithDuplicate();
  const result = await resolveHeldDuplicate(store, idbResolvePort, 'ingredients|a-1', 'keep-cloud');
  assert.deepEqual(result, { kind: 'ingredient', counts: { recipes: 1, groceryLists: 1, macroLogs: 1 } });
  assert.equal(await db.get('ingredients', 'b-1'), undefined);
  assert.ok(await db.get('ingredients', 'a-1'));
  const r = (await db.get('recipes', 'r-b')) as unknown as { ingredients: { ingredientId: string; variantId: string }[] };
  assert.deepEqual([r.ingredients[0].ingredientId, r.ingredients[0].variantId], ['a-1', 'a-1-v1']);
  const gl = (await db.get('groceryLists', 'gl')) as unknown as { items: { ingredientId: string; variantId: string }[] };
  assert.deepEqual([gl.items[0].ingredientId, gl.items[0].variantId], ['a-1', 'a-1-v1']);
  assert.equal(((await db.get('macroLogs', 'ml')) as unknown as { variantId: string }).variantId, 'a-1-v1');
  assert.equal((await store.listHeld()).length, 0);
  const sync = await engine.syncOnce();
  assert.equal(sync.status, 'ok');
  // the other device ends with ONE oregano and the repointed recipe
  await A.engine.syncOnce();
  assert.equal(A.all('ingredients').filter((i) => String(i.name).toLowerCase() === 'oregano').length, 1);
  assert.equal(((A.get('recipes', 'r-b')!.ingredients as { ingredientId: string }[])[0]).ingredientId, 'a-1');
  void s;
});

test('real database, "keep mine": our copy stays, the incoming one is retired on the server and never returns', async () => {
  const { s, A, db, store, engine } = await idbDeviceWithDuplicate();
  const result = await resolveHeldDuplicate(store, idbResolvePort, 'ingredients|a-1', 'keep-local');
  assert.deepEqual(result, { kind: 'ingredient', counts: { recipes: 0, groceryLists: 0, macroLogs: 0 } });
  assert.ok(await db.get('ingredients', 'b-1'));
  assert.equal(await db.get('ingredients', 'a-1'), undefined);
  assert.equal((await engine.syncOnce()).status, 'ok');
  await A.engine.syncOnce();
  assert.equal(A.get('ingredients', 'a-1'), undefined);
  assert.ok(A.get('ingredients', 'b-1'));
  const quiet = await engine.syncOnce();
  assert.deepEqual([quiet.pushed, quiet.pulled, quiet.held], [0, 0, 0]);
  void s;
});

test('real database, "keep both": both stay, nothing is repointed or deleted', async () => {
  const { db, store, engine } = await idbDeviceWithDuplicate();
  const result = await resolveHeldDuplicate(store, idbResolvePort, 'ingredients|a-1', 'keep-both');
  assert.equal(result, null);
  assert.ok(await db.get('ingredients', 'b-1') && await db.get('ingredients', 'a-1'));
  const o = await engine.syncOnce();
  assert.deepEqual([o.status, o.pushed], ['ok', 0]);
});
