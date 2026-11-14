import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeServer, call } from './helpers.js';

function withFrontend<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-frontend-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Meal Planner</title>');
  fs.writeFileSync(path.join(dir, 'sw.js'), '// service worker');
  fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), '{}');
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  return fn(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('the app shell, service worker and manifest are revalidated; hashed assets are cached forever', () =>
  withFrontend(async (dir) => {
    const { app } = makeServer({ FRONTEND_DIR: dir });
    await app.ready();
    const index = await app.inject({ method: 'GET', url: '/' });
    assert.equal(index.statusCode, 200);
    assert.match(index.body, /Meal Planner/);
    assert.equal(index.headers['cache-control'], 'no-cache');
    assert.equal((await app.inject({ method: 'GET', url: '/sw.js' })).headers['cache-control'], 'no-cache');
    assert.equal((await app.inject({ method: 'GET', url: '/manifest.webmanifest' })).headers['cache-control'], 'no-cache');
    const asset = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
  }));

test('client-side routes (BrowserRouter) fall back to the shell; unknown /api paths stay JSON 404s', () =>
  withFrontend(async (dir) => {
    const { app } = makeServer({ FRONTEND_DIR: dir });
    await app.ready();
    for (const url of ['/cookbook', '/planner', '/settings', '/import-ingredients', '/help']) {
      const r = await app.inject({ method: 'GET', url });
      assert.equal(r.statusCode, 200, url);
      assert.match(r.body, /Meal Planner/);
      assert.equal(r.headers['cache-control'], 'no-cache');
    }
    const api = await app.inject({ method: 'GET', url: '/api/nope' });
    assert.equal(api.statusCode, 404);
    assert.equal(api.json().error, 'Not found.');
  }));

test('API-only mode (no FRONTEND_DIR) still serves the API', async () => {
  const { app } = makeServer();
  assert.equal((await call(app, 'GET', '/api/health')).status, 200);
  assert.equal((await call(app, 'GET', '/')).status, 404);
});
