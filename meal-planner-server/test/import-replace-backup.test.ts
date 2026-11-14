import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeServer, call, setupOwner, rec } from './helpers.js';
import { backupNow, pruneBackups, msUntilHour, BACKUP_PREFIX } from '../src/backup.js';
import { Store } from '../src/store.js';

// What Settings > Data > Export > Full backup writes today, plus the two stores it currently leaves out.
const nativeBackup = () => ({
  version: 1, scope: 'full', exportedAt: '2026-11-13T09:00:00.000Z',
  ingredients: [
    { id: 'ing-1', name: 'Butter', variants: [], updatedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'ing-2', name: 'Flour', variants: [] },                                   // old row with no updatedAt
  ],
  recipes: [{ id: 'rec-1', title: 'Pancakes', updatedAt: '2026-10-02T00:00:00.000Z' }],
  settings: { householdName: 'Angelo Family', geminiApiKey: 'AIza-secret', ai: { provider: 'gemini', apiKey: 'k' }, supabaseUrl: 'https://x.supabase.co', updatedAt: '2026-10-03T00:00:00.000Z' },
  mealPlanDays: [{ date: '2026-11-13', meals: [] }, { date: '2026-11-14', meals: [] }],
  mealPlanTemplates: [{ id: 'tpl-1' }],     // not synced: ignored
  macroLogs: [{ id: 'm-1' }],               // not synced: ignored
  groceryLists: [{ id: 'gl-1', name: 'Weekly', updatedAt: '2026-10-04T00:00:00.000Z' }],
  householdItems: [{ id: 'hi-1', name: 'Soap' }],
  collections: [{ id: 'col-1', name: 'Weeknights' }],
  references: [{ id: 'ref-1', title: 'Oven temps' }],
});

test('import: a native backup lands in every synced table, ids and timestamps filled in, secrets stripped', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const r = await call(app, 'POST', '/api/admin/import', { token: owner.token, body: nativeBackup() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.tables, { ingredients: 2, recipes: 1, mealPlanDays: 2, groceryLists: 1, householdItems: 1, collections: 1, references: 1, settings: 1 });
  assert.equal(r.json.total, 10);

  const pull = await call(app, 'GET', '/api/sync/pull?since=0&limit=100', { token: owner.token });
  const byKey = new Map(pull.json.records.map((x: any) => [`${x.table}/${x.id}`, x.record]));
  assert.equal(byKey.size, 10);
  assert.equal((byKey.get('mealPlanDays/2026-11-13') as any).date, '2026-11-13');        // date-keyed day gets id = date
  assert.equal((byKey.get('ingredients/ing-2') as any).updatedAt, '2026-11-13T09:00:00.000Z'); // missing updatedAt <- exportedAt
  assert.equal((byKey.get('ingredients/ing-1') as any).updatedAt, '2026-10-01T00:00:00.000Z'); // existing one is kept
  const settings = byKey.get('settings/singleton') as any;
  assert.equal(settings.householdName, 'Angelo Family');
  for (const f of ['geminiApiKey', 'ai', 'supabaseUrl']) assert.equal(f in settings, false);
  assert.doesNotMatch(JSON.stringify(pull.json), /AIza-secret/);
  assert.equal(pull.json.records.some((x: any) => x.table === 'macroLogs' || x.table === 'mealPlanTemplates'), false);
});

test('import: refuses to run over existing data unless told to; a partial backup (ingredients only) is fine', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const ing = { version: 1, scope: 'ingredients', exportedAt: '2026-11-13T09:00:00.000Z', ingredients: [{ id: 'i1', name: 'Butter', variants: [] }] };
  assert.equal((await call(app, 'POST', '/api/admin/import', { token: owner.token, body: ing })).status, 200);
  const second = await call(app, 'POST', '/api/admin/import', { token: owner.token, body: ing });
  assert.equal(second.status, 409);
  assert.equal((await call(app, 'POST', '/api/admin/import?allowNonEmpty=true', { token: owner.token, body: ing })).status, 200);
});

test('import: bad backups are rejected whole -- nothing is written', async () => {
  const { app, store } = makeServer();
  const owner = await setupOwner(app);
  const bad = (body: unknown) => call(app, 'POST', '/api/admin/import', { token: owner.token, body });
  assert.equal((await bad({ ingredients: [] })).status, 400);                                                   // no version
  assert.equal((await bad({ version: 2, ingredients: [] })).status, 400);                                       // wrong version
  assert.equal((await bad({ version: 1, scope: 'full' })).status, 400);                                         // nothing in it
  assert.equal((await bad({ version: 1, ingredients: 'nope' })).status, 400);                                   // not a list
  assert.equal((await bad({ version: 1, ingredients: [{ name: 'no id' }] })).status, 400);
  assert.equal((await bad({ version: 1, ingredients: [{ id: 'dup' }, { id: 'dup' }] })).status, 400);          // duplicate id
  assert.equal((await bad({ version: 1, ingredients: [{ id: 'ok' }], mealPlanDays: [{ date: 'someday' }] })).status, 400); // bad date, after a good table
  assert.equal(store.recordCount(), 0);
});

test('replace-data: server is made to match the device; extras become tombstones; settings is never tombstoned', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await call(app, 'POST', '/api/sync/push', { token: owner.token, body: { changes: [
    rec('ingredients', 'starter-1', { name: 'Starter A' }), rec('ingredients', 'starter-2', { name: 'Starter B' }),
    rec('ingredients', 'keep', { name: 'Keep (old)' }), rec('settings', 'singleton', { householdName: 'Old' }),
  ] } });
  const stats = await call(app, 'GET', '/api/admin/stats', { token: owner.token });
  const r = await call(app, 'POST', '/api/admin/replace-data', { token: owner.token, body: {
    expectedRev: stats.json.rev, deviceId: 'tablet-1',
    changes: [rec('ingredients', 'keep', { name: 'Keep (real)' }), rec('recipes', 'r1', { title: 'Real recipe' })],
  } });
  assert.equal(r.status, 200);
  assert.equal(r.json.tombstoned, 2);
  assert.equal(r.json.upserted, 2);
  assert.match(String(r.json.backup), /^meal-planner-.*\.sqlite$/);
  const after = await call(app, 'GET', '/api/admin/stats', { token: owner.token });
  assert.deepEqual(after.json.tables.ingredients, { live: 1, deleted: 2 });
  assert.deepEqual(after.json.tables.settings, { live: 1, deleted: 0 });
  assert.deepEqual(after.json.tables.recipes, { live: 1, deleted: 0 });
  // Other devices converge by pulling: the starters arrive as tombstones.
  const pull = await call(app, 'GET', '/api/sync/pull?since=4', { token: owner.token });
  const dead = pull.json.records.filter((x: any) => x.deleted).map((x: any) => x.id).sort();
  assert.deepEqual(dead, ['starter-1', 'starter-2']);
});

test('replace-data: refused (and nothing changed) when the server moved since the caller looked, or the input is bad', async () => {
  const { app, store } = makeServer();
  const owner = await setupOwner(app);
  await call(app, 'POST', '/api/sync/push', { token: owner.token, body: { changes: [rec('ingredients', 'a', { name: 'a' })] } });
  const stale = await call(app, 'POST', '/api/admin/replace-data', { token: owner.token, body: { expectedRev: 0, changes: [rec('ingredients', 'b', { name: 'b' })] } });
  assert.equal(stale.status, 409);
  assert.equal(store.countsByTable().ingredients.live, 1);
  assert.equal(store.getRecord('ingredients', 'b'), undefined);
  assert.equal((await call(app, 'POST', '/api/admin/replace-data', { token: owner.token, body: { expectedRev: 1, changes: [] } })).status, 400);
  assert.equal((await call(app, 'POST', '/api/admin/replace-data', { token: owner.token, body: { changes: [rec('ingredients', 'b', {})] } })).status, 400);
  assert.equal((await call(app, 'POST', '/api/admin/replace-data', { token: owner.token, body: { expectedRev: 1, changes: [rec('ingredients', 'b', {}), rec('ingredients', 'b', {})] } })).status, 400);
  assert.equal(store.currentRev(), 1);
});

// ---- backups ----
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mp-backup-'));

test('backup: a verified, openable copy of the database is written, and the live server keeps working', async () => {
  const dir = tmpDir();
  try {
    const live = path.join(dir, 'live.sqlite');
    const store = new Store(live);
    store.tx(() => { store.putRecord('ingredients', 'i1', { id: 'i1', updatedAt: 't', name: 'Butter' }, { userId: null, deviceId: null }); });
    const r = backupNow(store, dir, new Date(2026, 10, 13, 3, 0, 5));
    assert.equal(r.records, 1);
    assert.match(path.basename(r.file), new RegExp(`^${BACKUP_PREFIX}2026-11-13_030005\\.sqlite$`));
    const copy = new DatabaseSync(r.file, { readOnly: true });
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n, 1);
    copy.close();
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.endsWith('.partial')), false);
    store.tx(() => { store.putRecord('ingredients', 'i2', { id: 'i2', updatedAt: 't' }, { userId: null, deviceId: null }); }); // still writable
    store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backup: pruning keeps only the newest N, and a NAS copy is made and pruned independently', async () => {
  const dir = tmpDir();
  const nas = tmpDir();
  try {
    const store = new Store(path.join(dir, 'live.sqlite'));
    for (let day = 1; day <= 4; day++) backupNow(store, dir, new Date(2026, 10, day, 3, 0, 0), { path: nas, keep: 2 });
    assert.equal(fs.readdirSync(nas).length, 2);                    // NAS pruned to 2 by backupNow itself
    assert.equal(pruneBackups(dir, 3), 1);                          // local had 4, keep 3
    const left = fs.readdirSync(path.join(dir, 'backups')).sort();
    assert.equal(left.length, 3);
    assert.match(left[0], /2026-11-02/);
    assert.equal(pruneBackups(dir, 0), 0);                          // 0 = never prune
    store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(nas, { recursive: true, force: true }); }
});

test('backup: an unreachable NAS never breaks the local backup', async () => {
  const dir = tmpDir();
  try {
    const store = new Store(path.join(dir, 'live.sqlite'));
    const logs: string[] = [];
    const blocker = path.join(dir, 'a-file-not-a-folder');
    fs.writeFileSync(blocker, 'x');
    const r = backupNow(store, dir, new Date(), { path: path.join(blocker, 'sub'), keep: 2, log: (m) => logs.push(m) });
    assert.ok(fs.existsSync(r.file));
    assert.equal(r.nas?.copied, false);
    assert.match(logs.join('\n'), /NAS backup copy failed/);
    store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backup: the nightly timer always aims at the future', () => {
  const at2am = new Date(2026, 10, 13, 2, 0, 0);
  assert.equal(msUntilHour(3, at2am), 3600_000);
  const at3am = new Date(2026, 10, 13, 3, 0, 0);
  assert.equal(msUntilHour(3, at3am), 24 * 3600_000);
});
