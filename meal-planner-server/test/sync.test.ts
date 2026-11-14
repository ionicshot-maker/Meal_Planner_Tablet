import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, call, setupOwner, addUser, rec } from './helpers.js';

async function push(app: any, token: string, changes: unknown[], deviceId = 'dev-1') {
  return call(app, 'POST', '/api/sync/push', { token, body: { changes, deviceId } });
}

test('push then pull round-trips every table, in revision order', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const changes = [
    rec('ingredients', 'ing-1', { name: 'Butter', variants: [] }),
    rec('recipes', 'rec-1', { title: 'Pancakes' }),
    rec('mealPlanDays', '2026-11-13', { date: '2026-11-13', meals: [] }),
    rec('groceryLists', 'gl-1', { name: 'Weekly' }),
    rec('householdItems', 'hi-1', { name: 'Soap' }),
    rec('collections', 'col-1', { name: 'Weeknights' }),
    rec('references', 'ref-1', { title: 'Oven temps' }),
    rec('settings', 'singleton', { householdName: 'Angelo' }),
  ];
  const r = await push(app, owner.token, changes);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.results.map((x: any) => x.status), Array(8).fill('accepted'));
  assert.deepEqual(r.json.results.map((x: any) => x.rev), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.json.serverRev, 8);

  const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  assert.deepEqual(pull.json.records.map((x: any) => x.table), changes.map((c) => c.table));
  assert.equal(pull.json.rev, 8);
  assert.equal(pull.json.more, false);
  assert.equal(pull.json.records[0].record.name, 'Butter');
});

test('pull only returns what is newer than the cursor, and pages with `more`', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [1, 2, 3, 4, 5].map((n) => rec('ingredients', `i${n}`, { name: `n${n}` })));
  const since3 = await call(app, 'GET', '/api/sync/pull?since=3', { token: owner.token });
  assert.deepEqual(since3.json.records.map((x: any) => x.id), ['i4', 'i5']);
  const page1 = await call(app, 'GET', '/api/sync/pull?since=0&limit=2', { token: owner.token });
  assert.equal(page1.json.records.length, 2);
  assert.equal(page1.json.more, true);
  assert.equal(page1.json.rev, 2);
  const page3 = await call(app, 'GET', '/api/sync/pull?since=4&limit=2', { token: owner.token });
  assert.equal(page3.json.more, false);
  const empty = await call(app, 'GET', '/api/sync/pull?since=5', { token: owner.token });
  assert.deepEqual(empty.json.records, []);
  assert.equal(empty.json.rev, 5); // cursor stays put when nothing is new
});

test('an edit with the right baseRev is accepted and gets a new revision', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('recipes', 'r1', { title: 'Pancakes' })]);
  const edit = await push(app, owner.token, [{ ...rec('recipes', 'r1', { title: 'Better Pancakes' }, '2026-11-13T11:00:00.000Z'), baseRev: 1 }]);
  assert.equal(edit.json.results[0].status, 'accepted');
  assert.equal(edit.json.results[0].rev, 2);
  const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  assert.equal(pull.json.records.length, 1);
  assert.equal(pull.json.records[0].record.title, 'Better Pancakes');
});

test('a stale baseRev is a conflict: the server keeps its copy and returns it', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  await push(app, owner.token, [rec('recipes', 'r1', { title: 'Pancakes' })]);                       // rev 1
  await push(app, rachel.token, [{ ...rec('recipes', 'r1', { title: 'Rachel version' }, '2026-11-13T11:00:00.000Z'), baseRev: 1 }]); // rev 2
  const stale = await push(app, owner.token, [{ ...rec('recipes', 'r1', { title: 'Michael version' }, '2026-11-13T11:05:00.000Z'), baseRev: 1 }]);
  const r0 = stale.json.results[0];
  assert.equal(r0.status, 'conflict');
  assert.equal(r0.rev, 2);
  assert.equal(r0.serverRecord.title, 'Rachel version');
  const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  assert.equal(pull.json.records[0].record.title, 'Rachel version'); // nothing was overwritten
  assert.equal(pull.json.serverRev, 2);
});

test('pushing a brand-new record with a non-zero baseRev for an existing id is a conflict, not an overwrite', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('ingredients', 'i1', { name: 'Butter' })]);
  const again = await push(app, owner.token, [rec('ingredients', 'i1', { name: 'Different' })]); // baseRev 0 but it exists
  assert.equal(again.json.results[0].status, 'conflict');
});

test('re-sending identical content is idempotent ("unchanged"), even with a newer updatedAt and a stale baseRev', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('ingredients', 'i1', { name: 'Butter', variants: [{ id: 'v', brand: 'x' }] })]);
  const retry = await push(app, owner.token, [rec('ingredients', 'i1', { variants: [{ brand: 'x', id: 'v' }], name: 'Butter' }, '2026-11-14T00:00:00.000Z')]);
  assert.equal(retry.json.results[0].status, 'unchanged');
  assert.equal(retry.json.serverRev, 1); // no revision burned
  const retry2 = await push(app, owner.token, [{ ...rec('ingredients', 'i1', { name: 'Butter', variants: [{ id: 'v', brand: 'x' }] }), baseRev: 1 }]);
  assert.equal(retry2.json.results[0].status, 'unchanged');
});

test('a delete is a tombstone: it is accepted, flagged deleted in the pull, and is not mistaken for "unchanged"', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('recipes', 'r1', { title: 'Pancakes' })]);
  const del = await push(app, owner.token, [{ table: 'recipes', id: 'r1', baseRev: 1, record: { id: 'r1', updatedAt: '2026-11-13T12:00:00.000Z', deletedAt: '2026-11-13T12:00:00.000Z' } }]);
  assert.equal(del.json.results[0].status, 'accepted');
  assert.equal(del.json.results[0].rev, 2);
  const pull = await call(app, 'GET', '/api/sync/pull?since=1', { token: owner.token });
  assert.equal(pull.json.records.length, 1);
  assert.equal(pull.json.records[0].deleted, true);
  assert.equal(pull.json.records[0].record.title, undefined); // the body is gone, only the tombstone remains
  const stats = await call(app, 'GET', '/api/admin/stats', { token: owner.token });
  assert.deepEqual(stats.json.tables.recipes, { live: 0, deleted: 1 });
});

test('a deleted record can be saved again (un-deleted) by a later push', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('recipes', 'r1', { title: 'Pancakes' })]);
  await push(app, owner.token, [{ table: 'recipes', id: 'r1', baseRev: 1, record: { id: 'r1', updatedAt: '2026-11-13T12:00:00.000Z', deletedAt: '2026-11-13T12:00:00.000Z' } }]);
  const back = await push(app, owner.token, [{ ...rec('recipes', 'r1', { title: 'Pancakes' }, '2026-11-13T13:00:00.000Z'), baseRev: 2 }]);
  assert.equal(back.json.results[0].status, 'accepted');
  const pull = await call(app, 'GET', '/api/sync/pull?since=2', { token: owner.token });
  assert.equal(pull.json.records[0].deleted, false);
  assert.equal(pull.json.records[0].record.title, 'Pancakes');
});

test('a delete pushed against a stale baseRev is a conflict (someone edited it meanwhile)', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  await push(app, owner.token, [rec('recipes', 'r1', { title: 'Pancakes' })]);
  await push(app, rachel.token, [{ ...rec('recipes', 'r1', { title: 'Edited' }, '2026-11-13T11:00:00.000Z'), baseRev: 1 }]);
  const del = await push(app, owner.token, [{ table: 'recipes', id: 'r1', baseRev: 1, record: { id: 'r1', updatedAt: '2026-11-13T12:00:00.000Z', deletedAt: '2026-11-13T12:00:00.000Z' } }]);
  assert.equal(del.json.results[0].status, 'conflict');
  assert.equal(del.json.results[0].serverRecord.title, 'Edited');
});

test('invalid changes are rejected one by one without sinking the rest of the push', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const r = await push(app, owner.token, [
    rec('ingredients', 'ok-1', { name: 'Butter' }),
    { table: 'nope', id: 'x', baseRev: 0, record: { id: 'x', updatedAt: 't' } },
    { table: 'recipes', id: 'a', baseRev: 0, record: { id: 'b', updatedAt: 't' } },                       // id mismatch
    { table: 'recipes', id: 'c', baseRev: 0, record: { id: 'c' } },                                       // no updatedAt
    { table: 'recipes', id: 'd', baseRev: -1, record: { id: 'd', updatedAt: 't' } },                      // bad baseRev
    { table: 'recipes', id: 'e', baseRev: 0, record: { id: 'e', updatedAt: 't', deletedAt: 5 } },         // bad deletedAt
    { table: 'settings', id: 'app', baseRev: 0, record: { id: 'app', updatedAt: 't' } },                  // settings must be "singleton"
    { table: 'settings', id: 'singleton', baseRev: 0, record: { id: 'singleton', updatedAt: 't', deletedAt: 't' } }, // settings can't be deleted
    { table: 'mealPlanDays', id: 'tuesday', baseRev: 0, record: { id: 'tuesday', updatedAt: 't' } },      // not a date
    'garbage',
    null,
    rec('ingredients', 'ok-2', { name: 'Flour' }),
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.results.map((x: any) => x.status), [
    'accepted', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'accepted',
  ]);
  assert.match(r.json.results[1].reason, /unknown table/);
  const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  assert.deepEqual(pull.json.records.map((x: any) => x.id), ['ok-1', 'ok-2']);
});

test('push body must be a list and is capped', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  assert.equal((await call(app, 'POST', '/api/sync/push', { token: owner.token, body: { changes: 'nope' } })).status, 400);
  assert.equal((await call(app, 'POST', '/api/sync/push', { token: owner.token, body: {} })).status, 400);
  const tooMany = Array.from({ length: 2001 }, (_, i) => rec('ingredients', `i${i}`, { name: 'x' }));
  assert.equal((await call(app, 'POST', '/api/sync/push', { token: owner.token, body: { changes: tooMany } })).status, 413);
});

test('settings secrets never reach the server: AI keys, the whole `ai` object and Supabase-era fields are removed', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const r = await push(app, owner.token, [rec('settings', 'singleton', {
    householdName: 'Angelo Family', unitSystem: 'imperial',
    geminiApiKey: 'AIza-secret-gemini', openaiApiKey: 'sk-secret-openai', groqApiKey: 'gsk-secret-groq', usdaApiKey: 'usda-secret',
    ai: { provider: 'gemini', apiKey: 'nested-secret' },
    supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-secret', householdSyncCode: 'angelo-family-2026',
    familyShareCode: 'fam', familyShareRole: 'owner',
  })]);
  assert.equal(r.json.results[0].status, 'accepted');
  const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  const stored = pull.json.records[0].record;
  assert.equal(stored.householdName, 'Angelo Family');
  assert.equal(stored.unitSystem, 'imperial');
  for (const field of ['geminiApiKey', 'openaiApiKey', 'groqApiKey', 'usdaApiKey', 'ai', 'supabaseUrl', 'supabaseAnonKey', 'householdSyncCode', 'familyShareCode', 'familyShareRole']) {
    assert.equal(field in stored, false, `${field} must be removed`);
  }
  assert.doesNotMatch(JSON.stringify(pull.json), /secret|AIza|sk-|gsk-|supabase\.co/);
});

test('redaction applies only to settings, not to ordinary records that happen to have a similarly named field', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('recipes', 'r1', { title: 'T', ai: { generated: true }, geminiApiKey: 'kept-because-not-settings' })]);
  const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  assert.deepEqual(pull.json.records[0].record.ai, { generated: true });
});

test('the redacted settings echo is "unchanged" when only a secret differs (so devices do not fight over it)', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('settings', 'singleton', { householdName: 'A', geminiApiKey: 'one' })]);
  const second = await push(app, owner.token, [rec('settings', 'singleton', { householdName: 'A', geminiApiKey: 'two' }, '2026-11-14T00:00:00.000Z')]);
  assert.equal(second.json.results[0].status, 'unchanged');
});

test('large records (a photo-sized payload) survive a round trip and a gzip pull', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const photo = 'A'.repeat(3_000_000);
  const r = await push(app, owner.token, [rec('references', 'ref-1', { title: 'Big', photo })]);
  assert.equal(r.json.results[0].status, 'accepted');
  const res = await app.inject({ method: 'GET', url: '/api/sync/pull?since=0', headers: { authorization: `Bearer ${owner.token}`, 'accept-encoding': 'gzip' } });
  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.ok(res.rawPayload.length < 100_000, 'repetitive JSON should compress hard');
  const { gunzipSync } = await import('node:zlib');
  assert.equal(JSON.parse(gunzipSync(res.rawPayload).toString()).records[0].record.photo.length, 3_000_000);
});

test('a push is all-or-nothing at the database level: a crash mid-push leaves no half-applied state', async () => {
  const { app, store } = makeServer();
  const owner = await setupOwner(app);
  const real = store.putRecord.bind(store);
  let n = 0;
  store.putRecord = ((...args: Parameters<typeof real>) => { if (++n === 2) throw new Error('disk full'); return real(...args); }) as typeof store.putRecord;
  const r = await push(app, owner.token, [rec('ingredients', 'a', { name: 'a' }), rec('ingredients', 'b', { name: 'b' })]);
  assert.equal(r.status, 500);
  store.putRecord = real;
  assert.equal(store.recordCount(), 0);
  assert.equal(store.currentRev(), 0);
});

test('a tombstone is never "unchanged" against a live record, even one with no fields beyond id and updatedAt', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await push(app, owner.token, [rec('collections', 'c1', {})]); // minimal live record
  const del = await push(app, owner.token, [{ table: 'collections', id: 'c1', baseRev: 1, record: { id: 'c1', updatedAt: '2026-11-13T12:00:00.000Z', deletedAt: '2026-11-13T12:00:00.000Z' } }]);
  assert.equal(del.json.results[0].status, 'accepted');
  const pull = await call(app, 'GET', '/api/sync/pull?since=1', { token: owner.token });
  assert.equal(pull.json.records[0].deleted, true);
});
