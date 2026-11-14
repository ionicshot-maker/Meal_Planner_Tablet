import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, call, setupOwner, addUser, rec, PW } from './helpers.js';

test('first run: health says setup is needed, setup creates the owner, then closes for good', async () => {
  const { app } = makeServer();
  assert.equal((await call(app, 'GET', '/api/health')).json.needsSetup, true);
  const owner = await setupOwner(app);
  assert.equal((await call(app, 'GET', '/api/health')).json.needsSetup, false);
  const me = await call(app, 'GET', '/api/me', { token: owner.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.role, 'owner');
  assert.equal(me.json.user.username, 'michael');
  assert.equal('password_hash' in me.json.user, false);
  const again = await call(app, 'POST', '/api/auth/setup', { body: { username: 'intruder', displayName: 'X', password: PW } });
  assert.equal(again.status, 409);
});

test('setup and user creation reject weak input', async () => {
  const { app } = makeServer();
  assert.equal((await call(app, 'POST', '/api/auth/setup', { body: { username: 'm', displayName: 'M', password: PW } })).status, 400); // username too short
  assert.equal((await call(app, 'POST', '/api/auth/setup', { body: { username: 'michael', displayName: 'M', password: 'short' } })).status, 400);
  assert.equal((await call(app, 'POST', '/api/auth/setup', { body: { username: 'michael', displayName: '', password: PW } })).status, 400);
});

test('sync and /me need a sign-in', async () => {
  const { app } = makeServer();
  await setupOwner(app);
  assert.equal((await call(app, 'GET', '/api/me')).status, 401);
  assert.equal((await call(app, 'GET', '/api/sync/pull')).status, 401);
  assert.equal((await call(app, 'POST', '/api/sync/push', { body: { changes: [] } })).status, 401);
  assert.equal((await call(app, 'GET', '/api/me', { token: 'not-a-real-token' })).status, 401);
});

test('login: wrong password and unknown user look the same; the session cookie is httpOnly', async () => {
  const { app } = makeServer();
  await setupOwner(app);
  const bad = await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: 'wrong password!' } });
  const ghost = await call(app, 'POST', '/api/auth/login', { body: { username: 'nobody', password: 'wrong password!' } });
  assert.equal(bad.status, 401);
  assert.equal(ghost.status, 401);
  assert.equal(bad.json.error, ghost.json.error);
  const ok = await call(app, 'POST', '/api/auth/login', { body: { username: 'MICHAEL', password: PW } }); // usernames are case-insensitive
  assert.equal(ok.status, 200);
  const setCookie = String(ok.headers['set-cookie']);
  assert.match(setCookie, /mp_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
});

test('the session cookie works as well as the bearer token', async () => {
  const { app } = makeServer();
  await setupOwner(app);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'michael', password: PW } });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
});

test('five wrong passwords lock that username+IP out for a while, even for the right password', async () => {
  const { app } = makeServer();
  await setupOwner(app);
  for (let i = 0; i < 5; i++) await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: 'wrong password!' } });
  const locked = await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: PW } });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers['retry-after']) > 0);
});

test('logout ends the session', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  assert.equal((await call(app, 'POST', '/api/auth/logout', { token: owner.token })).status, 200);
  assert.equal((await call(app, 'GET', '/api/me', { token: owner.token })).status, 401);
});

test('owner adds Rachel as a contributor; role is required and must be valid', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const noRole = await call(app, 'POST', '/api/users', { token: owner.token, body: { username: 'rachel', displayName: 'Rachel Angelo', password: PW } });
  assert.equal(noRole.status, 400);
  const badRole = await call(app, 'POST', '/api/users', { token: owner.token, body: { username: 'rachel', displayName: 'Rachel Angelo', password: PW, role: 'admin' } });
  assert.equal(badRole.status, 400);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  const me = await call(app, 'GET', '/api/me', { token: rachel.token });
  assert.equal(me.json.user.role, 'contributor');
  const dupe = await call(app, 'POST', '/api/users', { token: owner.token, body: { username: 'RACHEL', displayName: 'Other', password: PW, role: 'readonly' } });
  assert.equal(dupe.status, 409);
  const list = await call(app, 'GET', '/api/users', { token: owner.token });
  assert.deepEqual(list.json.users.map((u: any) => [u.username, u.role]), [['michael', 'owner'], ['rachel', 'contributor']]);
});

test('only owners manage accounts: contributors and read-only accounts are refused everywhere', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  const guest = await addUser(app, owner, 'guest', 'readonly');
  for (const who of [rachel, guest]) {
    assert.equal((await call(app, 'GET', '/api/users', { token: who.token })).status, 403);
    assert.equal((await call(app, 'POST', '/api/users', { token: who.token, body: { username: 'x1', displayName: 'X', password: PW, role: 'owner' } })).status, 403);
    assert.equal((await call(app, 'POST', `/api/users/${owner.id}/role`, { token: who.token, body: { role: 'readonly' } })).status, 403);
    assert.equal((await call(app, 'POST', `/api/users/${owner.id}/password`, { token: who.token, body: { newPassword: 'a brand new passphrase' } })).status, 403);
    assert.equal((await call(app, 'POST', `/api/users/${owner.id}/disable`, { token: who.token })).status, 403);
    assert.equal((await call(app, 'DELETE', `/api/users/${owner.id}`, { token: who.token })).status, 403);
    assert.equal((await call(app, 'GET', '/api/admin/stats', { token: who.token })).status, 403);
    assert.equal((await call(app, 'POST', '/api/admin/import', { token: who.token, body: { version: 1, ingredients: [] } })).status, 403);
    assert.equal((await call(app, 'POST', '/api/admin/replace-data', { token: who.token, body: { changes: [], expectedRev: 0 } })).status, 403);
  }
});

test('the last owner can never be disabled, demoted or removed -- but can once a second owner exists', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  // Demoting yourself as the only owner is refused.
  assert.equal((await call(app, 'POST', `/api/users/${owner.id}/role`, { token: owner.token, body: { role: 'contributor' } })).status, 400);
  assert.equal((await call(app, 'POST', `/api/users/${owner.id}/disable`, { token: owner.token })).status, 400);
  assert.equal((await call(app, 'DELETE', `/api/users/${owner.id}`, { token: owner.token })).status, 400);
  // Promote Rachel; now there are two owners and Rachel can demote Michael.
  assert.equal((await call(app, 'POST', `/api/users/${rachel.id}/role`, { token: owner.token, body: { role: 'owner' } })).status, 200);
  assert.equal((await call(app, 'POST', `/api/users/${owner.id}/role`, { token: rachel.token, body: { role: 'contributor' } })).status, 200);
  // ...and now Rachel is the only owner again, so she is protected.
  assert.equal((await call(app, 'POST', `/api/users/${rachel.id}/role`, { token: rachel.token, body: { role: 'readonly' } })).status, 400);
});

test('a disabled owner does not count toward "at least one owner"', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'owner');
  assert.equal((await call(app, 'POST', `/api/users/${rachel.id}/disable`, { token: owner.token })).status, 200);
  assert.equal((await call(app, 'POST', `/api/users/${owner.id}/role`, { token: owner.token, body: { role: 'readonly' } })).status, 400);
  assert.equal((await call(app, 'POST', `/api/users/${rachel.id}/enable`, { token: owner.token })).status, 200);
  assert.equal((await call(app, 'POST', `/api/users/${owner.id}/role`, { token: owner.token, body: { role: 'readonly' } })).status, 200);
});

test('you cannot disable or delete your own account', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  await addUser(app, owner, 'rachel', 'owner'); // second owner so the last-owner rule is not what stops us
  assert.equal((await call(app, 'POST', `/api/users/${owner.id}/disable`, { token: owner.token })).status, 400);
  assert.equal((await call(app, 'DELETE', `/api/users/${owner.id}`, { token: owner.token })).status, 400);
});

test('disabling signs the person out at once and blocks login; enabling lets them back', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  await call(app, 'POST', `/api/users/${rachel.id}/disable`, { token: owner.token });
  assert.equal((await call(app, 'GET', '/api/me', { token: rachel.token })).status, 401);
  assert.equal((await call(app, 'POST', '/api/auth/login', { body: { username: 'rachel', password: PW } })).status, 401);
  await call(app, 'POST', `/api/users/${rachel.id}/enable`, { token: owner.token });
  assert.equal((await call(app, 'POST', '/api/auth/login', { body: { username: 'rachel', password: PW } })).status, 200);
});

test('removing an account ends its sessions; the shared data stays', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  await call(app, 'POST', '/api/sync/push', { token: rachel.token, body: { changes: [rec('ingredients', 'i1', { name: 'Butter' })] } });
  assert.equal((await call(app, 'DELETE', `/api/users/${rachel.id}`, { token: owner.token })).status, 200);
  assert.equal((await call(app, 'GET', '/api/me', { token: rachel.token })).status, 401);
  const pull = await call(app, 'GET', '/api/sync/pull', { token: owner.token });
  assert.equal(pull.json.records.length, 1);
});

test('changing your own password needs the current one, signs out other devices, keeps this one in', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const other = (await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: PW } })).json.token;
  const wrong = await call(app, 'POST', '/api/auth/password', { token: owner.token, body: { currentPassword: 'not it at all!', newPassword: 'a brand new passphrase' } });
  assert.equal(wrong.status, 403);
  const weak = await call(app, 'POST', '/api/auth/password', { token: owner.token, body: { currentPassword: PW, newPassword: 'short' } });
  assert.equal(weak.status, 400);
  const ok = await call(app, 'POST', '/api/auth/password', { token: owner.token, body: { currentPassword: PW, newPassword: 'a brand new passphrase' } });
  assert.equal(ok.status, 200);
  assert.equal((await call(app, 'GET', '/api/me', { token: owner.token })).status, 401); // old token is gone...
  assert.equal((await call(app, 'GET', '/api/me', { token: ok.json.token })).status, 200); // ...the fresh one works
  assert.equal((await call(app, 'GET', '/api/me', { token: other })).status, 401);
  assert.equal((await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: PW } })).status, 401);
  assert.equal((await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: 'a brand new passphrase' } })).status, 200);
});

test('an owner can reset someone else\'s password, which signs them out everywhere', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  assert.equal((await call(app, 'POST', `/api/users/${rachel.id}/password`, { token: owner.token, body: { newPassword: 'short' } })).status, 400);
  assert.equal((await call(app, 'POST', `/api/users/${rachel.id}/password`, { token: owner.token, body: { newPassword: 'fresh start passphrase' } })).status, 200);
  assert.equal((await call(app, 'GET', '/api/me', { token: rachel.token })).status, 401);
  assert.equal((await call(app, 'POST', '/api/auth/login', { body: { username: 'rachel', password: 'fresh start passphrase' } })).status, 200);
  assert.equal((await call(app, 'POST', `/api/users/no-such-id/password`, { token: owner.token, body: { newPassword: 'fresh start passphrase' } })).status, 404);
});

test('read-only accounts can pull but every push is refused by the server; contributors and owners can push', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  const guest = await addUser(app, owner, 'guest', 'readonly');
  assert.equal((await call(app, 'POST', '/api/sync/push', { token: owner.token, body: { changes: [rec('ingredients', 'i1', { name: 'Butter' })] } })).status, 200);
  assert.equal((await call(app, 'POST', '/api/sync/push', { token: rachel.token, body: { changes: [rec('ingredients', 'i2', { name: 'Flour' })] } })).status, 200);
  const refused = await call(app, 'POST', '/api/sync/push', { token: guest.token, body: { changes: [rec('ingredients', 'i3', { name: 'Sneaky' })] } });
  assert.equal(refused.status, 403);
  const pull = await call(app, 'GET', '/api/sync/pull', { token: guest.token });
  assert.equal(pull.status, 200);
  assert.deepEqual(pull.json.records.map((r: any) => r.id), ['i1', 'i2']); // the refused write never landed
});

test('demoting someone to read-only takes effect immediately on their existing session', async () => {
  const { app } = makeServer();
  const owner = await setupOwner(app);
  const rachel = await addUser(app, owner, 'rachel', 'contributor');
  await call(app, 'POST', `/api/users/${rachel.id}/role`, { token: owner.token, body: { role: 'readonly' } });
  assert.equal((await call(app, 'POST', '/api/sync/push', { token: rachel.token, body: { changes: [rec('ingredients', 'i1', { name: 'Butter' })] } })).status, 403);
  assert.equal((await call(app, 'GET', '/api/me', { token: rachel.token })).json.user.role, 'readonly');
});

test('cross-origin writes are refused; same-origin and no-Origin writes are fine', async () => {
  const { app } = makeServer({ PUBLIC_ORIGIN: 'https://angelo-server.example.ts.net:8447' });
  const evil = await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: PW }, headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const ours = await call(app, 'POST', '/api/auth/login', { body: { username: 'michael', password: PW }, headers: { origin: 'https://angelo-server.example.ts.net:8447' } });
  assert.notEqual(ours.status, 403);
});

test('extra allowed origins are honoured', async () => {
  const { app } = makeServer({ PUBLIC_ORIGIN: 'https://a.example', ALLOWED_ORIGINS: 'http://192.168.1.50:8791' });
  const lan = await call(app, 'POST', '/api/auth/login', { body: { username: 'x', password: 'y' }, headers: { origin: 'http://192.168.1.50:8791' } });
  assert.notEqual(lan.status, 403);
});

test('responses carry the security headers', async () => {
  const { app } = makeServer();
  const r = await call(app, 'GET', '/api/health');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
});
