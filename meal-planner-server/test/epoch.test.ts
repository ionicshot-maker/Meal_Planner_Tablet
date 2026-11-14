import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { ensureEpoch, highWaterRecorder } from '../src/epoch.js';
import { backupNow } from '../src/backup.js';
import { makeServer, call, setupOwner, rec } from './helpers.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mp-epoch-'));
const write = (store: Store, id: string) => store.tx(() => { store.putRecord('ingredients', id, { id, updatedAt: 't' }, { userId: null, deviceId: null }); });
const quiet = () => {};

test('a fresh folder gets a mark; restarting on the same database keeps the same epoch', () => {
  const dir = tmp();
  try {
    const db = path.join(dir, 'm.sqlite');
    let s = new Store(db);
    const first = ensureEpoch(s, dir, quiet);
    assert.equal(first.rotated, false);
    assert.ok(fs.existsSync(path.join(dir, 'epoch.json')));
    s.close();
    s = new Store(db);
    const second = ensureEpoch(s, dir, quiet);
    assert.equal(second.rotated, false);
    assert.equal(second.epoch, first.epoch);
    s.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('normal growth is not a rollback: the mark follows the revision up, restarts do not rotate', () => {
  const dir = tmp();
  try {
    const s = new Store(path.join(dir, 'm.sqlite'));
    const e0 = ensureEpoch(s, dir, quiet).epoch;
    const record = highWaterRecorder(s, dir);
    for (let i = 0; i < 5; i++) { write(s, `i${i}`); record(); }
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'epoch.json'), 'utf8')).rev, 5);
    s.close();
    const s2 = new Store(path.join(dir, 'm.sqlite'));
    const again = ensureEpoch(s2, dir, quiet);
    assert.equal(again.rotated, false);
    assert.equal(again.epoch, e0);
    s2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('restoring an OLDER backup over the database is detected at startup and mints a new epoch', () => {
  const dir = tmp();
  try {
    const live = path.join(dir, 'm.sqlite');
    let s = new Store(live);
    const e0 = ensureEpoch(s, dir, quiet).epoch;
    const record = highWaterRecorder(s, dir);
    for (let i = 0; i < 4; i++) { write(s, `a${i}`); record(); }
    const backup = backupNow(s, dir).file;                       // taken at revision 4: it carries epoch e0
    for (let i = 0; i < 6; i++) { write(s, `b${i}`); record(); } // the server moves on to revision 10
    s.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(live + ext, { force: true });
    fs.copyFileSync(backup, live);                               // the restore
    s = new Store(live);
    assert.equal(s.currentRev(), 4);
    assert.equal(s.epoch(), e0, 'the backup carries the old epoch, so the epoch alone could never reveal the restore');
    const logs: string[] = [];
    const after = ensureEpoch(s, dir, (m) => logs.push(m));
    assert.equal(after.rotated, true);
    assert.notEqual(after.epoch, e0);
    assert.equal(s.epoch(), after.epoch);
    assert.match(logs.join(''), /revision 4 .* already served revision 10/);
    // and it settles: the next start is quiet
    s.close();
    s = new Store(live);
    assert.equal(ensureEpoch(s, dir, quiet).rotated, false);
    s.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('restoring a backup taken at the current revision (identical data) changes nothing', () => {
  const dir = tmp();
  try {
    const live = path.join(dir, 'm.sqlite');
    let s = new Store(live);
    ensureEpoch(s, dir, quiet);
    const record = highWaterRecorder(s, dir);
    for (let i = 0; i < 3; i++) { write(s, `a${i}`); record(); }
    const backup = backupNow(s, dir).file;
    s.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(live + ext, { force: true });
    fs.copyFileSync(backup, live);
    s = new Store(live);
    assert.equal(ensureEpoch(s, dir, quiet).rotated, false);
    s.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the pull response carries the epoch, and the write routes move the high-water mark', async () => {
  const dir = tmp();
  try {
    const store = new Store(path.join(dir, 'm.sqlite'));
    ensureEpoch(store, dir, quiet);
    const app = buildApp(store, loadConfig({ DATA_DIR: dir }), { afterWrite: highWaterRecorder(store, dir) });
    const owner = await setupOwner(app);
    const r = await call(app, 'POST', '/api/sync/push', { token: owner.token, body: { changes: [rec('ingredients', 'i1', { name: 'Butter' }), rec('recipes', 'r1', { title: 'T' })] } });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'epoch.json'), 'utf8')).rev, 2);
    const pull = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
    assert.equal(pull.json.epoch, store.epoch());
    const imp = await call(app, 'POST', '/api/admin/import?allowNonEmpty=true', { token: owner.token, body: { version: 1, ingredients: [{ id: 'i9', name: 'X', updatedAt: 't' }] } });
    assert.equal(imp.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'epoch.json'), 'utf8')).rev, 3);
    store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a server with no sidecar hooks (the plain test server) still reports a stable epoch', async () => {
  const { app, store } = makeServer();
  const owner = await setupOwner(app);
  const a = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  const b = await call(app, 'GET', '/api/sync/pull?since=0', { token: owner.token });
  assert.equal(a.json.epoch, b.json.epoch);
  assert.equal(a.json.epoch, store.epoch());
});
