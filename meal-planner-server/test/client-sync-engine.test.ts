import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, call, setupOwner, addUser } from './helpers.js';
import { makeDevice, ingredient, recipe, nextTime, type Device } from './clientHarness.js';
import { NetworkError, MAX_UNCONFIRMED_DELETES, type Transport } from '../../src/sync/engine.ts';

async function world() {
  const s = makeServer();
  const owner = await setupOwner(s.app);                       // michael, owner
  await addUser(s.app, owner, 'rachel', 'contributor');
  await addUser(s.app, owner, 'guest', 'readonly');
  const mk = async (name: string, user = 'michael', opts: Parameters<typeof makeDevice>[2] = {}) => {
    const d = makeDevice(s.app, name, opts);
    await d.signIn(user);
    return d;
  };
  const stats = async () => (await call(s.app, 'GET', '/api/admin/stats', { token: owner.token })).json.tables as Record<string, { live: number; deleted: number }>;
  const pullAll = async () => (await call(s.app, 'GET', '/api/sync/pull?since=0&limit=5000', { token: owner.token })).json.records as any[];
  return { ...s, owner, mk, stats, pullAll };
}

/** Device A syncs a small household; device B adopts it. Both end up in sync. */
async function twoDevices() {
  const w = await world();
  const A = await w.mk('A', 'michael', { settings: { householdName: 'Angelo Family', fontSizePt: 18, geminiApiKey: 'KEY-A', ai: { provider: 'ollama', apiKey: 'SECRET-A' } } });
  for (const [id, name] of [['i1', 'Butter'], ['i2', 'Flour'], ['i3', 'Sugar']]) await A.save('ingredients', ingredient(id, name));
  await A.save('recipes', recipe('r1', 'Pancakes'));
  await A.save('recipes', recipe('r2', 'Waffles'));
  const first = await A.engine.syncOnce();
  assert.equal(first.status, 'ok');
  const B = await w.mk('B', 'michael', { settings: { fontSizePt: 22, geminiApiKey: 'KEY-B', ai: { provider: 'gemini', apiKey: 'SECRET-B' } } });
  assert.equal((await B.engine.syncOnce()).status, 'needs-adopt');
  assert.equal((await B.engine.adoptServerData()).status, 'ok');
  return { ...w, A, B };
}

// ============================================================ replication
test('a first device sends everything (settings included); a second sync is a no-op', async () => {
  const w = await world();
  const A = await w.mk('A');
  await A.save('ingredients', ingredient('i1', 'Butter'));
  await A.save('recipes', recipe('r1', 'Pancakes'));
  await A.save('mealPlanDays', { date: '2026-11-14', meals: [{ slot: 'dinner', recipeId: 'r1' }] });
  await A.save('groceryLists', { id: 'g1', name: 'Weekly', generatedAt: '2026-11-13T00:00:00.000Z' });
  await A.save('householdItems', { id: 'h1', name: 'Soap' });
  await A.save('collections', { id: 'c1', name: 'Weeknights', recipeIds: ['r1'] });
  await A.save('references', { id: 'ref1', title: 'Oven temps' });
  const out = await A.engine.syncOnce();
  assert.equal(out.status, 'ok');
  assert.equal(out.pushed, 8);                                    // 7 records + the settings singleton
  const t = await w.stats();
  for (const table of ['ingredients', 'recipes', 'mealPlanDays', 'groceryLists', 'householdItems', 'collections', 'references', 'settings']) {
    assert.deepEqual(t[table], { live: 1, deleted: 0 }, table);
  }
  const again = await A.engine.syncOnce();
  assert.deepEqual([again.status, again.pushed, again.pulled, again.conflicts], ['ok', 0, 0, 0]);
});

test('a second device never merges blindly into a populated server: it must adopt; adoption copies everything', async () => {
  const { A, B, pullAll } = await twoDevices();
  assert.deepEqual(B.all('ingredients').map((i) => i.name).sort(), ['Butter', 'Flour', 'Sugar']);
  assert.deepEqual(B.all('recipes').map((i) => i.name).sort(), ['Pancakes', 'Waffles']);
  assert.equal(B.get('ingredients', 'i1')!.updatedAt, A.get('ingredients', 'i1')!.updatedAt, 'pulled records keep their server timestamp (not re-stamped)');
  const after = await B.engine.syncOnce();
  assert.deepEqual([after.status, after.pushed, after.pulled], ['ok', 0, 0]); // nothing bounces back
  assert.ok((await pullAll()).length > 0);
});

test('a meal-plan day (keyed by date, no id of its own) round-trips without gaining an id', async () => {
  const { A, B, pullAll } = await twoDevices();
  await A.save('mealPlanDays', { date: '2026-11-20', meals: [{ slot: 'lunch', recipeId: 'r2' }] });
  await A.engine.syncOnce();
  const wire = (await pullAll()).find((r) => r.table === 'mealPlanDays');
  assert.equal(wire.id, '2026-11-20');
  const out = await B.engine.syncOnce();
  assert.equal(out.pulled, 1);
  const day = B.get('mealPlanDays', '2026-11-20')!;
  assert.equal(day.date, '2026-11-20');
  assert.equal('id' in day, false, 'the local shape is untouched');
  await A.save('mealPlanDays', { date: '2026-11-20', meals: [] });         // edit it back
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  assert.deepEqual(B.get('mealPlanDays', '2026-11-20')!.meals, []);
});

test('edits flow both ways and report changedLocal so the UI can refresh', async () => {
  const { A, B } = await twoDevices();
  await B.save('ingredients', { ...B.get('ingredients', 'i1')!, name: 'Salted Butter' });
  assert.equal((await B.engine.syncOnce()).pushed, 1);
  const a = await A.engine.syncOnce();
  assert.equal(a.pulled, 1);
  assert.equal(a.changedLocal, true);
  assert.equal(A.get('ingredients', 'i1')!.name, 'Salted Butter');
  const idle = await A.engine.syncOnce();
  assert.equal(idle.changedLocal, false);
});

test('saving a record again without changing it does not push anything (updatedAt alone is not a change)', async () => {
  const { A } = await twoDevices();
  await A.save('ingredients', { ...A.get('ingredients', 'i1')! });
  const out = await A.engine.syncOnce();
  assert.equal(out.pushed, 0);
});

// ============================================================ settings
test('settings: only the household\'s fields sync; each device keeps its own keys, text size and AI key', async () => {
  const { A, B, pullAll } = await twoDevices();
  // adoption already brought householdName and the AI provider over; B still has its own private values
  const bs = B.get('settings', 'singleton')!;
  assert.equal(bs.householdName, 'Angelo Family');
  assert.equal((bs.ai as any).provider, 'ollama');
  assert.equal((bs.ai as any).apiKey, 'SECRET-B');
  assert.equal(bs.geminiApiKey, 'KEY-B');
  assert.equal(bs.fontSizePt, 22);
  // a household setting changed on B reaches A; A's private values are untouched
  await B.save('settings', { ...bs, stores: ['Aldi', 'Kroger'] });
  assert.equal((await B.engine.syncOnce()).pushed, 1);
  await A.engine.syncOnce();
  const as = A.get('settings', 'singleton')!;
  assert.deepEqual(as.stores, ['Aldi', 'Kroger']);
  assert.equal(as.geminiApiKey, 'KEY-A');
  assert.equal((as.ai as any).apiKey, 'SECRET-A');
  assert.equal(as.fontSizePt, 18);
  // and nothing private ever reached the server
  const serverSettings = (await pullAll()).find((r) => r.table === 'settings').record;
  assert.equal(serverSettings.stores.length, 2);
  assert.doesNotMatch(JSON.stringify(serverSettings), /KEY-A|KEY-B|SECRET/);
  for (const f of ['geminiApiKey', 'ai', 'fontSizePt']) assert.equal(f in serverSettings, false, f);
});

test('changing only a device-local setting (text size, key) is not a change to sync', async () => {
  const { A } = await twoDevices();
  await A.save('settings', { ...A.get('settings', 'singleton')!, fontSizePt: 30, geminiApiKey: 'NEW-KEY' });
  const out = await A.engine.syncOnce();
  assert.equal(out.pushed, 0);
});

// ============================================================ deletes (detected by absence)
test('a delete on one device becomes a tombstone and removes the record on the other', async () => {
  const { A, B, stats } = await twoDevices();
  await A.remove('recipes', 'r1');
  const a = await A.engine.syncOnce();
  assert.equal(a.pushed, 1);
  assert.deepEqual((await stats()).recipes, { live: 1, deleted: 1 });
  const b = await B.engine.syncOnce();
  assert.equal(b.pulled, 1);
  assert.equal(b.changedLocal, true);
  assert.equal(B.get('recipes', 'r1'), undefined);
  assert.ok(B.get('recipes', 'r2'));
  for (const d of [A, B]) {                                      // nothing echoes, nothing resurrects it
    const o = await d.engine.syncOnce();
    assert.deepEqual([o.pushed, o.pulled], [0, 0]);
  }
  assert.equal(A.get('recipes', 'r1'), undefined);
});

test('re-creating a deleted record un-deletes it everywhere', async () => {
  const { A, B } = await twoDevices();
  await A.remove('recipes', 'r1');
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  await A.save('recipes', recipe('r1', 'Pancakes (again)'));
  assert.equal((await A.engine.syncOnce()).pushed, 1);
  await B.engine.syncOnce();
  assert.equal(B.get('recipes', 'r1')!.name, 'Pancakes (again)');
});

test('a record that was never exchanged and is deleted locally is simply gone (no tombstone is pushed)', async () => {
  const { A, stats } = await twoDevices();
  await A.save('recipes', recipe('tmp', 'Scratch'));
  await A.remove('recipes', 'tmp');
  assert.equal((await A.engine.syncOnce()).pushed, 0);
  assert.deepEqual((await stats()).recipes, { live: 2, deleted: 0 });
});

// ============================================================ the mass-delete guard
async function bigHousehold(count: number, extra?: (d: Device) => Promise<void>) {
  const w = await world();
  const A = await w.mk('A');
  for (let i = 0; i < count; i++) await A.save('ingredients', ingredient(`ing-${i}`, `Ingredient ${i}`));
  if (extra) await extra(A);
  assert.equal((await A.engine.syncOnce()).status, 'ok');
  return { ...w, A };
}

test('deleting more than the cap in one go is held back: nothing is deleted for anyone until confirmed', async () => {
  const N = MAX_UNCONFIRMED_DELETES + 30;
  const { A, stats } = await bigHousehold(N + 20);
  for (let i = 0; i < N; i++) await A.remove('ingredients', `ing-${i}`);
  await A.save('ingredients', { ...A.get('ingredients', `ing-${N}`)!, name: 'Edited meanwhile' });
  const out = await A.engine.syncOnce();
  assert.equal(out.status, 'needs-delete-confirm');
  assert.deepEqual(out.pendingDeletes, { ingredients: N });
  assert.match(out.message!, /removed 80 items/);
  assert.equal(out.pushed, 1, 'ordinary edits still go through');
  assert.deepEqual((await stats()).ingredients, { live: N + 20, deleted: 0 });
  // still held on the next cycle
  assert.equal((await A.engine.syncOnce()).status, 'needs-delete-confirm');
  // confirming sends them
  const ok = await A.engine.syncOnce({ confirmDeletes: true });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.pushed, N);
  assert.deepEqual((await stats()).ingredients, { live: 20, deleted: N });
});

test('"put them back" cancels the held deletions by re-fetching the records from the server', async () => {
  const { A, stats } = await bigHousehold(70);
  for (let i = 0; i < 60; i++) await A.remove('ingredients', `ing-${i}`);
  assert.equal((await A.engine.syncOnce()).status, 'needs-delete-confirm');
  const back = await A.engine.restoreDeletedFromServer();
  assert.equal(back.status, 'ok');
  assert.equal(back.changedLocal, true);
  assert.match(back.message!, /Brought 60 removed items back/);
  assert.equal(A.all('ingredients').length, 70);
  assert.deepEqual((await stats()).ingredients, { live: 70, deleted: 0 });
  const calm = await A.engine.syncOnce();
  assert.deepEqual([calm.status, calm.pushed], ['ok', 0]);
});

test('a share-of-table rule catches big deletions in smaller tables; small, ordinary deletions are not held', async () => {
  // 20 recipes: deleting 5 is 25% (allowed), deleting 6 is more than 25% (held)
  const five = await bigHousehold(0, async (d) => { for (let i = 0; i < 20; i++) await d.save('recipes', recipe(`r${i}`, `Recipe ${i}`)); });
  for (let i = 0; i < 5; i++) await five.A.remove('recipes', `r${i}`);
  assert.equal((await five.A.engine.syncOnce()).status, 'ok');
  const six = await bigHousehold(0, async (d) => { for (let i = 0; i < 20; i++) await d.save('recipes', recipe(`r${i}`, `Recipe ${i}`)); });
  for (let i = 0; i < 6; i++) await six.A.remove('recipes', `r${i}`);
  const held = await six.A.engine.syncOnce();
  assert.equal(held.status, 'needs-delete-confirm');
  assert.deepEqual(held.pendingDeletes, { recipes: 6 });
  // removing one of three recipes (or even all four of four) is just a delete, not a "mass" one
  const tiny = await bigHousehold(0, async (d) => { for (let i = 0; i < 4; i++) await d.save('recipes', recipe(`r${i}`, `Recipe ${i}`)); });
  for (let i = 0; i < 4; i++) await tiny.A.remove('recipes', `r${i}`);
  assert.equal((await tiny.A.engine.syncOnce()).status, 'ok');
});

test('wiping the local database (a reset) is caught by the guard before it can wipe the household', async () => {
  const { A, B, stats } = await twoDevices();
  for (let i = 0; i < 60; i++) await A.save('ingredients', ingredient(`more-${i}`, `More ${i}`));
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  for (const t of ['ingredients', 'recipes'] as const) for (const r of A.all(t)) await A.remove(t, r.id as string); // "Reset everything"
  const out = await A.engine.syncOnce();
  assert.equal(out.status, 'needs-delete-confirm');
  assert.deepEqual((await stats()).ingredients, { live: 63, deleted: 0 });
  await B.engine.syncOnce();
  assert.equal(B.all('ingredients').length, 63, 'the other device never saw a delete');
});

// ============================================================ conflicts
test('both devices edit the same record: the newer edit wins, and the losing version is kept in the log', async () => {
  const { A, B } = await twoDevices();
  await A.save('recipes', { ...A.get('recipes', 'r1')!, name: 'A-version' });
  await B.save('recipes', { ...B.get('recipes', 'r1')!, name: 'B-version (newer)' });
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.conflicts, 1);
  assert.equal(B.get('recipes', 'r1')!.name, 'B-version (newer)');
  const log = await B.store.listConflicts();
  assert.equal(log.length, 1);
  assert.equal(log[0].kept, 'local');
  assert.equal((log[0].server as any).name, 'A-version');
  await A.engine.syncOnce();
  assert.equal(A.get('recipes', 'r1')!.name, 'B-version (newer)');
});

test('...and when the OTHER device\'s edit is newer, it wins and this device\'s version is kept in the log', async () => {
  const { A, B } = await twoDevices();
  await B.save('recipes', { ...B.get('recipes', 'r1')!, name: 'B-version (older)' });
  await A.save('recipes', { ...A.get('recipes', 'r1')!, name: 'A-version (newer)' });
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.conflicts, 1);
  assert.equal(B.get('recipes', 'r1')!.name, 'A-version (newer)');
  const log = await B.store.listConflicts();
  assert.equal(log[0].kept, 'server');
  assert.equal((log[0].local as any).name, 'B-version (older)');
});

test('an exact tie goes to the server', async () => {
  const { A, B } = await twoDevices();
  const same = nextTime();
  A.backing.data.get('recipes')!.set('r1', { ...A.get('recipes', 'r1')!, name: 'A-tie', updatedAt: same });
  B.backing.data.get('recipes')!.set('r1', { ...B.get('recipes', 'r1')!, name: 'B-tie', updatedAt: same });
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  assert.equal(B.get('recipes', 'r1')!.name, 'A-tie');
  assert.equal((await B.store.listConflicts())[0].kept, 'server');
});

test('identical content on both sides is not a conflict', async () => {
  const { A, B } = await twoDevices();
  await A.save('recipes', { ...A.get('recipes', 'r1')!, notes: 'same' });
  await B.save('recipes', { ...B.get('recipes', 'r1')!, notes: 'same' });
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.conflicts, 0);
});

test('edited here after it was deleted there: the newer edit survives and the record comes back for everyone', async () => {
  const { A, B, stats } = await twoDevices();
  await A.remove('recipes', 'r1');
  await A.engine.syncOnce();                                     // tombstone stamped now
  await B.save('recipes', { ...B.get('recipes', 'r1')!, name: 'Edited after the delete' });
  const b = await B.engine.syncOnce();
  assert.equal(b.conflicts, 1);
  assert.equal(B.get('recipes', 'r1')!.name, 'Edited after the delete');
  assert.deepEqual((await stats()).recipes, { live: 2, deleted: 0 });
  await A.engine.syncOnce();
  assert.equal(A.get('recipes', 'r1')!.name, 'Edited after the delete');
});

test('edited here BEFORE it was deleted there: the delete wins, and the edited copy stays in the conflict log', async () => {
  const { A, B } = await twoDevices();
  await B.save('recipes', { ...B.get('recipes', 'r1')!, name: 'Edited before the delete' });
  await A.remove('recipes', 'r1');
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.conflicts, 1);
  assert.equal(B.get('recipes', 'r1'), undefined);
  const log = await B.store.listConflicts();
  assert.equal(log[0].kept, 'server');
  assert.equal((log[0].local as any).name, 'Edited before the delete');
});

test('deleted here, edited there: our delete stands, and the edited copy is kept in the log so it can be restored', async () => {
  const { A, B, stats } = await twoDevices();
  await B.remove('recipes', 'r1');
  await A.save('recipes', { ...A.get('recipes', 'r1')!, name: 'Edited elsewhere' });
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.status, 'ok');
  assert.equal(b.conflicts, 1);
  assert.equal(B.get('recipes', 'r1'), undefined);
  assert.deepEqual((await stats()).recipes, { live: 1, deleted: 1 });
  const log = await B.store.listConflicts();
  assert.equal(log[0].kept, 'local');
  assert.equal(log[0].local, null);
  assert.equal((log[0].server as any).name, 'Edited elsewhere');
});

// ============================================================ duplicate names
test('two devices independently creating the same name are NOT merged silently: each holds the other\'s copy for review', async () => {
  const { A, B, stats } = await twoDevices();
  await A.save('ingredients', ingredient('a-butter', 'Unsalted Butter'));
  await B.save('ingredients', ingredient('b-butter', '  unsalted butter '));
  assert.equal((await A.engine.syncOnce()).pushed, 1);
  const b = await B.engine.syncOnce();
  assert.equal(b.held, 1);
  assert.equal(b.pushed, 1, 'B\'s own record still goes up');
  assert.equal(B.get('ingredients', 'a-butter'), undefined, 'no twin was created locally');
  const held = await B.store.listHeld();
  assert.equal(held.length, 1);
  assert.deepEqual([held[0].table, held[0].cloudId, held[0].localId], ['ingredients', 'a-butter', 'b-butter']);
  const a = await A.engine.syncOnce();
  assert.equal(a.held, 1);
  assert.equal(A.get('ingredients', 'b-butter'), undefined);
  assert.deepEqual((await stats()).ingredients, { live: 5, deleted: 0 });
  // holding is stable: no tombstone is pushed for a record that was simply held, and nothing is re-held
  for (const d of [A, B]) {
    const o = await d.engine.syncOnce();
    assert.deepEqual([o.pushed, o.held, o.status], [0, 0, 'ok']);
  }
  assert.deepEqual((await stats()).ingredients, { live: 5, deleted: 0 });
});

test('recipes are matched by name too, and a same-id update is never mistaken for a duplicate', async () => {
  const { A, B } = await twoDevices();
  await A.save('recipes', recipe('a-chili', 'Chili'));
  await B.save('recipes', recipe('b-chili', 'chili'));
  await A.engine.syncOnce();
  assert.equal((await B.engine.syncOnce()).held, 1);
  // an update to a record B already has (same id) is simply applied
  await A.save('recipes', { ...A.get('recipes', 'r1')!, name: 'Pancakes v2' });
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.held, 0);
  assert.equal(B.get('recipes', 'r1')!.name, 'Pancakes v2');
});

test('only ingredients and recipes are name-matched: other tables may legitimately repeat names', async () => {
  const { A, B } = await twoDevices();
  await A.save('collections', { id: 'c-a', name: 'Dinners' });
  await B.save('collections', { id: 'c-b', name: 'Dinners' });
  await A.engine.syncOnce();
  const b = await B.engine.syncOnce();
  assert.equal(b.held, 0);
  assert.ok(B.get('collections', 'c-a') && B.get('collections', 'c-b'));
});

test('a held duplicate that the other device then deletes is released, not left dangling', async () => {
  const { A, B } = await twoDevices();
  await A.save('ingredients', ingredient('a-honey', 'Honey'));
  await B.save('ingredients', ingredient('b-honey', 'honey'));
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  assert.equal((await B.store.listHeld()).length, 1);
  await A.remove('ingredients', 'a-honey');
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  assert.equal((await B.store.listHeld()).length, 0);
});

// ============================================================ roles
test('a read-only account keeps receiving updates; its own edits wait (not lost) until it is allowed to write', async () => {
  const w = await twoDevices();
  const G = await w.mk('G', 'guest');
  assert.equal((await G.engine.syncOnce()).status, 'needs-adopt');
  assert.equal((await G.engine.adoptServerData()).status, 'ok');
  assert.equal(G.all('recipes').length, 2);
  await w.A.save('recipes', recipe('r3', 'Added by Michael'));
  await w.A.engine.syncOnce();
  await G.save('recipes', { ...G.get('recipes', 'r1')!, name: 'Guest edit' });
  const out = await G.engine.syncOnce();
  assert.equal(out.status, 'read-only');
  assert.match(out.message!, /read-only/i);
  assert.equal(G.get('recipes', 'r3')!.name, 'Added by Michael', 'it still pulled');
  assert.equal(G.get('recipes', 'r1')!.name, 'Guest edit', 'its edit is still on the device');
  assert.equal((await call(w.app, 'GET', '/api/sync/pull?since=0', { token: w.owner.token })).json.records.find((r: any) => r.id === 'r1').record.name, 'Pancakes');
  // an owner promotes the account: the waiting edit goes up on the next cycle
  const users = (await call(w.app, 'GET', '/api/users', { token: w.owner.token })).json.users;
  const guest = users.find((u: any) => u.username === 'guest');
  await call(w.app, 'POST', `/api/users/${guest.id}/role`, { token: w.owner.token, body: { role: 'contributor' } });
  const later = await G.engine.syncOnce();
  assert.equal(later.status, 'ok');
  assert.equal(later.pushed, 1);
});

test('an account that is not an owner cannot use "make the server match this device"', async () => {
  const w = await twoDevices();
  const R = await w.mk('R', 'rachel');
  await R.save('recipes', recipe('rr', 'Rachel recipe'));
  const out = await R.engine.makeServerMatchThisDevice();
  assert.equal(out.status, 'read-only');
  assert.match(out.message!, /owner/i);
});

// ============================================================ first contact & replace
test('"make the server match this device": starter data on the server is retired, never erased, and other devices converge', async () => {
  const w = await world();
  const A = await w.mk('A');
  for (let i = 0; i < 10; i++) await A.save('ingredients', ingredient(`starter-${i}`, `Starter ${i}`));
  await A.engine.syncOnce();
  const B = await w.mk('B');
  for (let i = 0; i < 5; i++) await B.save('ingredients', ingredient(`real-${i}`, `Real ${i}`));
  await B.save('recipes', recipe('rr', 'Real recipe'));
  assert.equal((await B.engine.syncOnce()).status, 'needs-adopt');
  const out = await B.engine.makeServerMatchThisDevice();
  assert.equal(out.status, 'ok');
  assert.match(out.message!, /10 other records retired/);
  assert.deepEqual((await w.stats()).ingredients, { live: 5, deleted: 10 });
  assert.equal(B.all('ingredients').length, 5, 'nothing on the device changed');
  const a = await A.engine.syncOnce();
  assert.equal(a.status, 'ok');
  assert.deepEqual(A.all('ingredients').map((r) => r.id).sort(), ['real-0', 'real-1', 'real-2', 'real-3', 'real-4']);
  assert.ok(A.get('recipes', 'rr'));
});

// ============================================================ resilience
test('a server restored from an older backup is detected: the device keeps its data and re-sends what the server lost', async () => {
  const { A, B, store, stats } = await twoDevices();
  await A.save('recipes', recipe('r9', 'Written after the backup'));
  await A.engine.syncOnce();
  assert.deepEqual((await stats()).recipes, { live: 3, deleted: 0 });
  store.db.exec("DELETE FROM records; UPDATE meta SET value = '0' WHERE key = 'rev';"); // the server "went back in time"
  store.rotateEpoch();                                           // what startup does when it notices (see epoch.test.ts)
  const out = await A.engine.syncOnce();
  assert.equal(out.status, 'ok');
  assert.match(out.message!, /restored from an older backup/);
  assert.deepEqual((await stats()).recipes, { live: 3, deleted: 0 });
  assert.equal(A.all('recipes').length, 3, 'no local data was lost');
  const b = await B.engine.syncOnce();
  assert.equal(b.status, 'ok');
  assert.equal(B.all('recipes').length, 3);
});

test('the server being unreachable is "offline": local edits stay put and go up on the next good sync', async () => {
  const w = await twoDevices();
  let up = false;
  const flaky = makeDevice(w.app, 'F', { transport: (api): Transport => ({
    pull: (...a) => (up ? api.pull(...a) : Promise.reject(new NetworkError('no route'))),
    push: (...a) => (up ? api.push(...a) : Promise.reject(new NetworkError('no route'))),
    replaceServerData: (...a) => api.replaceServerData(...a),
  }) });
  await flaky.signIn('michael');
  await flaky.save('recipes', recipe('f1', 'Made offline'));
  const down = await flaky.engine.syncOnce();
  assert.equal(down.status, 'offline');
  assert.match(down.message!, /changes stay on this device/);
  assert.ok(flaky.get('recipes', 'f1'));
  up = true;
  assert.equal((await flaky.engine.syncOnce()).status, 'needs-adopt'); // (it is a fresh device on a populated server)
});

test('signing out (or an expired session) is reported as signed-out, and nothing is lost', async () => {
  const { A } = await twoDevices();
  await A.save('recipes', recipe('r5', 'Offline edit'));
  await A.api.logout();
  const out = await A.engine.syncOnce();
  assert.equal(out.status, 'signed-out');
  assert.ok(A.get('recipes', 'r5'));
  await A.signIn('michael');
  assert.equal((await A.engine.syncOnce()).pushed, 1);
});

test('a pull page is applied atomically: a crash mid-commit changes nothing, and the next sync completes it', async () => {
  const { A, B } = await twoDevices();
  for (let i = 0; i < 5; i++) await A.save('recipes', recipe(`n${i}`, `New ${i}`));
  await A.engine.syncOnce();
  const before = B.all('recipes').length;
  B.backing.failNextApplyAfter = 3;
  const bad = await B.engine.syncOnce();
  assert.equal(bad.status, 'error');
  assert.equal(B.all('recipes').length, before, 'half a page was not applied');
  assert.equal(await B.store.getCursor() < 10, true, 'the cursor did not move past what was applied');
  const good = await B.engine.syncOnce();
  assert.equal(good.status, 'ok');
  assert.equal(B.all('recipes').length, before + 5);
});

test('records with no updatedAt at all still sync (older rows)', async () => {
  const { A, B } = await twoDevices();
  A.backing.data.get('recipes')!.set('old', { id: 'old', name: 'Grandma\'s card', servings: 2 });
  assert.equal((await A.engine.syncOnce()).pushed, 1);
  await B.engine.syncOnce();
  assert.equal(B.get('recipes', 'old')!.name, 'Grandma\'s card');
});

// ============================================================ scale
test('a realistic household (6,500 ingredients) syncs in pages, adopts cleanly, and a no-change cycle is quick', async () => {
  const w = await world();
  const A = await w.mk('A');
  const N = 6500;
  for (let i = 0; i < N; i++) {
    A.backing.data.get('ingredients')!.set(`big-${i}`, ingredient(`big-${i}`, `Ingredient number ${i}`, { updatedAt: nextTime(), brand: 'Great Value', barcode: String(1000000000000 + i) }));
  }
  let t = Date.now();
  const first = await A.engine.syncOnce();
  const tFirst = Date.now() - t;
  assert.equal(first.status, 'ok');
  assert.equal(first.pushed, N + 1);
  const B = await w.mk('B');
  assert.equal((await B.engine.syncOnce()).status, 'needs-adopt');
  t = Date.now();
  const adopt = await B.engine.adoptServerData();
  const tAdopt = Date.now() - t;
  assert.equal(adopt.pulled, N + 1);
  assert.equal(B.all('ingredients').length, N);
  t = Date.now();
  const idle = await A.engine.syncOnce();
  const tIdle = Date.now() - t;
  assert.deepEqual([idle.status, idle.pushed, idle.pulled], ['ok', 0, 0]);
  console.log(`  [scale] first push ${tFirst} ms, adopt ${tAdopt} ms, no-change cycle ${tIdle} ms (${N} ingredients)`);
  assert.ok(tIdle < 5000, `a no-change cycle took ${tIdle} ms`);
});

test('a restore that is only visible as a LOWER revision (no epoch change) is still caught by the device that already saw more', async () => {
  const { A, store, stats } = await twoDevices();
  await A.save('recipes', recipe('r9', 'Written after the backup'));
  await A.engine.syncOnce();
  store.db.exec("DELETE FROM records WHERE tbl = 'recipes' AND id = 'r9'; UPDATE meta SET value = '3' WHERE key = 'rev';"); // rolled back to rev 3
  const out = await A.engine.syncOnce();
  assert.equal(out.status, 'ok');
  assert.match(out.message!, /restored from an older backup/);
  assert.equal((await stats()).recipes.live, 3, 'the device re-sent the record the server lost');
});

test('a second device that missed the restore entirely still converges, because the epoch changed (revisions had grown back)', async () => {
  const { A, B, store } = await twoDevices();
  await A.save('recipes', recipe('r9', 'Written after the backup'));
  await A.engine.syncOnce();                                     // server rev 7; B has only seen up to 6
  store.db.exec("DELETE FROM records; UPDATE meta SET value = '0' WHERE key = 'rev';");
  store.rotateEpoch();
  await A.engine.syncOnce();                                     // A re-sends everything: server rev is back up to 7, past B's cursor
  const b = await B.engine.syncOnce();
  assert.equal(b.status, 'ok');
  assert.equal(B.all('recipes').length, 3, 'B did not silently miss r9');
  assert.ok(B.get('recipes', 'r9'));
});

// ============================================================ resolving held duplicates
import { resolveHeldDuplicate, type ResolvePort } from '../../src/sync/duplicates.ts';

/** A port over a device's memory backing; "repointing" is simulated by rewriting recipe.ingredients[].ingredientId. */
function portFor(d: Device): ResolvePort<number> & { repointed: string[] } {
  const repointed: string[] = [];
  const fix = (from: string, to: string) => {
    let n = 0;
    for (const r of d.all('recipes')) {
      const ings = (r.ingredients as { ingredientId: string }[]) ?? [];
      if (ings.some((i) => i.ingredientId === from)) { d.backing.data.get('recipes')!.set(r.id as string, { ...r, ingredients: ings.map((i) => (i.ingredientId === from ? { ...i, ingredientId: to } : i)) }); n++; }
    }
    repointed.push(`${from}->${to}`);
    return n;
  };
  return {
    repointed,
    none: () => 0,
    get: async (t, id) => d.get(t, id),
    put: async (t, rec) => { d.backing.data.get(t)!.set(rec.id as string, rec); },
    keepIncoming: async (t, local, incoming) => { d.backing.data.get(t)!.set(incoming.id as string, incoming); const n = fix(local.id as string, incoming.id as string); d.backing.data.get(t)!.delete(local.id as string); return n; },
    repointToLocal: async (_t, incoming, local) => fix(incoming.id as string, local.id as string),
  };
}

async function heldButter() {
  const w = await twoDevices();
  const { A, B } = w;
  await A.save('ingredients', ingredient('a-butter', 'Ghee'));
  await B.save('ingredients', ingredient('b-butter', 'ghee'));
  await B.save('recipes', recipe('uses-b', 'Uses B butter', { ingredients: [{ ingredientId: 'b-butter', quantity: 1 }] }));
  await A.engine.syncOnce();
  await B.engine.syncOnce();
  const key = 'ingredients|a-butter';
  assert.ok(await B.store.getHeld(key));
  return { ...w, key };
}

test('duplicate review "keep both": the incoming copy is added next to ours and nothing else changes', async () => {
  const { A, B, key, stats } = await heldButter();
  const n = await resolveHeldDuplicate(B.store, portFor(B), key, 'keep-both');
  assert.equal(n, 0);
  assert.ok(B.get('ingredients', 'a-butter') && B.get('ingredients', 'b-butter'));
  assert.equal((await B.store.listHeld()).length, 0);
  const o = await B.engine.syncOnce();
  assert.deepEqual([o.status, o.pushed], ['ok', 0]); // B already pushed its own copy in the cycle that held the other one
  assert.deepEqual((await stats()).ingredients.deleted, 0);
  const again = await B.engine.syncOnce();
  assert.equal(again.pushed, 0);
  void A;
});

test('duplicate review "keep theirs": our copy is replaced, recipes are repointed, and the deletion reaches everyone', async () => {
  const { A, B, key, stats } = await heldButter();
  const port = portFor(B);
  const n = await resolveHeldDuplicate(B.store, port, key, 'keep-cloud');
  assert.equal(n, 1);
  assert.deepEqual(port.repointed, ['b-butter->a-butter']);
  assert.equal(B.get('ingredients', 'b-butter'), undefined);
  assert.ok(B.get('ingredients', 'a-butter'));
  assert.deepEqual((B.get('recipes', 'uses-b')!.ingredients as any[])[0].ingredientId, 'a-butter');
  const o = await B.engine.syncOnce();
  assert.equal(o.status, 'ok');
  const t = await stats();
  assert.deepEqual(t.ingredients.deleted, 1, 'b-butter was already exchanged by the earlier cycle, so its removal is sent as a tombstone');
  await A.engine.syncOnce();
  assert.equal(A.all('ingredients').filter((i) => String(i.name).toLowerCase() === 'ghee').length, 1);
});

test('duplicate review "keep mine": the incoming copy is retired on the server (a tombstone), ours stays, and it never comes back', async () => {
  const { A, B, key, stats } = await heldButter();
  await resolveHeldDuplicate(B.store, portFor(B), key, 'keep-local');
  assert.equal(B.get('ingredients', 'a-butter'), undefined);
  assert.ok(B.get('ingredients', 'b-butter'));
  const o = await B.engine.syncOnce();
  assert.equal(o.status, 'ok');
  assert.ok(o.pushed >= 1);
  const t = await stats();
  assert.equal(t.ingredients.deleted, 1);
  await A.engine.syncOnce();
  assert.equal(A.get('ingredients', 'a-butter'), undefined, 'the loser is gone from the device that created it');
  const quiet = await B.engine.syncOnce();
  assert.deepEqual([quiet.pushed, quiet.held, quiet.pulled], [0, 0, 0]);
});

test('settling a duplicate whose local copy has since been deleted just takes the incoming one; settling twice is refused', async () => {
  const { B, key } = await heldButter();
  await B.remove('ingredients', 'b-butter');
  await resolveHeldDuplicate(B.store, portFor(B), key, 'keep-local');
  assert.ok(B.get('ingredients', 'a-butter'), 'with nothing to collide with, the incoming copy is kept regardless of the choice');
  await assert.rejects(() => resolveHeldDuplicate(B.store, portFor(B), key, 'keep-both'), /already been settled/);
});
