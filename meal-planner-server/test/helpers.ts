import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Store, type Role } from '../src/store.js';

export const PW = 'correct horse battery';

// Anything a route writes to disk (the safety backup replace-data takes first, for one) must go to a throwaway folder, never into the
// working directory. One per test process, removed when it ends.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-server-test-'));
process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ } });

export function makeServer(env: NodeJS.ProcessEnv = {}) {
  const store = new Store(':memory:');
  const config = loadConfig({ PUBLIC_ORIGIN: 'http://localhost:8791', DATA_DIR: scratch, ...env });
  const app = buildApp(store, config);
  return { store, config, app };
}

export interface Session { token: string; id: string }

export async function call(app: FastifyInstance, method: 'GET' | 'POST' | 'DELETE', url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await app.inject({ method, url, headers, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
  let json: any = null;
  try { json = res.json(); } catch { /* not JSON */ }
  return { status: res.statusCode, json, headers: res.headers };
}

/** First-run setup: the owner. */
export async function setupOwner(app: FastifyInstance, username = 'michael'): Promise<Session> {
  const r = await call(app, 'POST', '/api/auth/setup', { body: { username, displayName: 'Michael Angelo', password: PW } });
  if (r.status !== 200) throw new Error(`setup failed: ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.json.token, id: r.json.user.id };
}

/** An owner adds an account and that person signs in. */
export async function addUser(app: FastifyInstance, owner: Session, username: string, role: Role): Promise<Session> {
  const add = await call(app, 'POST', '/api/users', { token: owner.token, body: { username, displayName: username, password: PW, role } });
  if (add.status !== 200) throw new Error(`add user failed: ${add.status} ${JSON.stringify(add.json)}`);
  const login = await call(app, 'POST', '/api/auth/login', { body: { username, password: PW } });
  return { token: login.json.token, id: add.json.user.id };
}

export const rec = (table: string, id: string, extra: Record<string, unknown> = {}, updatedAt = '2026-11-13T10:00:00.000Z') =>
  ({ table, id, baseRev: 0, record: { id, updatedAt, ...extra } });
