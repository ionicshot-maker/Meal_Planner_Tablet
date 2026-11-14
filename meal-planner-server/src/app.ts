import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { type Config, isSecureOrigin } from './config.js';
import { Store, isRole, type Role, type UserRow } from './store.js';
import { hashPassword, verifyPassword, DUMMY_HASH, passwordProblem } from './passwords.js';
import { applyPush, importBackup, replaceAll, BadRequest, Conflict } from './sync.js';
import { backupNow } from './backup.js';
import { registerAiRoutes } from './ai/index.js';

const COOKIE = 'mp_session';

declare module 'fastify' {
  interface FastifyRequest { user?: UserRow }
}

const publicUser = (u: UserRow) => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role });
const adminUser = (u: UserRow) => ({ ...publicUser(u), disabled: !!u.disabled, createdAt: u.created_at });

/** Failed-login throttle: per username+IP, in memory (single process, restarts clear it). */
class LoginThrottle {
  private fails = new Map<string, { n: number; until: number }>();
  check(key: string): number {
    const f = this.fails.get(key);
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  }
  fail(key: string) {
    const n = (this.fails.get(key)?.n ?? 0) + 1;
    this.fails.set(key, { n, until: n >= 5 ? Date.now() + Math.min(15 * 60_000, 2 ** (n - 5) * 30_000) : 0 });
  }
  ok(key: string) { this.fails.delete(key); }
}

export function buildApp(store: Store, config: Config): FastifyInstance {
  // 64 MB: recipe/reference photos and the one-time backup import are embedded as base64 in JSON.
  const app = Fastify({ logger: false, trustProxy: config.trustProxy, bodyLimit: 64 * 1024 * 1024 });
  const canonicalSecure = isSecureOrigin(config);
  /** Is THIS request arriving over HTTPS? Behind a trusted proxy the proxy says so (X-Forwarded-Proto); otherwise we can only
   * go by the configured public origin. */
  const isSecure = (req: FastifyRequest) => (config.trustProxy ? req.protocol === 'https' : canonicalSecure);
  const throttle = new LoginThrottle();
  void app.register(cookie);

  // ---- CSRF: the session cookie is SameSite=Lax; additionally, when the browser sends an Origin on a state-changing request,
  // that origin must be ours. ----
  app.addHook('onRequest', async (req, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) return reply.code(403).send({ error: 'Cross-origin request refused.' });
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    // Compress big JSON responses (a sync page is megabytes of repetitive JSON).
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.includes('json') && !reply.getHeader('content-encoding') && /\bgzip\b/.test(String(_req.headers['accept-encoding'] ?? ''))) {
      const raw = typeof payload === 'string' ? Buffer.from(payload) : Buffer.isBuffer(payload) ? payload : null;
      if (raw && raw.length > 1024) {
        payload = zlib.gzipSync(raw);
        reply.header('Content-Encoding', 'gzip');
        reply.header('Vary', 'Accept-Encoding');
        reply.removeHeader('content-length');
      }
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    if (isSecure(_req)) reply.header('Strict-Transport-Security', 'max-age=31536000');
    return payload;
  });

  // Returns the raw token too (in addition to setting the cookie): iOS/Android home-screen web apps run in a separate storage
  // context and are known to drop Set-Cookie session cookies, so the client keeps a copy in localStorage and sends it back as an
  // Authorization header. The server accepts either; plain browser tabs just use the cookie.
  const startSession = (reply: FastifyReply, req: FastifyRequest, user: UserRow): string => {
    const token = store.createSession(user.id, config.sessionDays, String(req.headers['user-agent'] ?? '').slice(0, 200) || null);
    reply.setCookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: '/', maxAge: config.sessionDays * 86_400,
    });
    return token;
  };

  const bearerToken = (req: FastifyRequest): string | undefined => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice('Bearer '.length).trim() || undefined : undefined;
  };
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[COOKIE] ?? bearerToken(req);
    const user = token ? store.sessionUser(token) : undefined;
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    req.user = user;
  };
  /** Owners only: account management, imports, anything that changes the household as a whole. */
  const requireOwner = async (req: FastifyRequest, reply: FastifyReply) => {
    await requireUser(req, reply);
    if (reply.sent) return;
    if (req.user!.role !== 'owner') return reply.code(403).send({ error: 'Only an owner can do that.' });
  };
  /** Owners and contributors. A read-only account can look and sync down, but every write is refused here, whatever the app shows. */
  const requireWriter = async (req: FastifyRequest, reply: FastifyReply) => {
    await requireUser(req, reply);
    if (reply.sent) return;
    if (req.user!.role === 'readonly') return reply.code(403).send({ error: 'This account is read-only.' });
  };

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof BadRequest) return reply.code(400).send({ error: err.message });
    if (err instanceof Conflict) return reply.code(409).send({ error: err.message });
    const status = err.statusCode ?? 500;
    if (status >= 500) console.error('Meal Planner server error:', err);
    return reply.code(status).send({ error: status >= 500 ? 'Internal error.' : err.message });
  });

  // ---- health / who am I ----
  app.get('/api/health', async () => ({ ok: true, rev: store.currentRev(), needsSetup: store.userCount() === 0 }));
  app.get('/api/me', { preHandler: requireUser }, async (req) => ({ user: publicUser(req.user!) }));

  // ---- accounts ----
  // First run only: creates the first account, who is the owner. After that this endpoint is closed for good.
  app.post('/api/auth/setup', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const err = validateNewUser(b);
    if (err) return reply.code(400).send({ error: err });
    const user = store.tx(() => {
      if (store.userCount() > 0) return null;
      return store.createUser({ username: String(b.username).trim(), displayName: String(b.displayName).trim(), passwordHash: PENDING, role: 'owner' });
    });
    if (!user) return reply.code(409).send({ error: 'Setup is already done.' });
    store.setPasswordHashOnly(user.id, await hashPassword(String(b.password)));
    const token = startSession(reply, req, store.userById(user.id)!);
    return { user: publicUser(user), token };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const key = `${username.toLowerCase()}|${req.ip}`;
    const wait = throttle.check(key);
    if (wait) return reply.code(429).header('Retry-After', String(wait)).send({ error: `Too many attempts. Try again in ${wait} seconds.` });
    const user = username ? store.userByUsername(username) : undefined;
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || user.disabled || !ok) {
      throttle.fail(key);
      return reply.code(401).send({ error: 'Wrong username or password.' });
    }
    throttle.ok(key);
    const token = startSession(reply, req, user);
    return { user: publicUser(user), token };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE] ?? bearerToken(req);
    if (token) store.deleteSession(token);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', { preHandler: requireUser }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const user = req.user!;
    if (!(await verifyPassword(String(b.currentPassword ?? ''), user.password_hash))) return reply.code(403).send({ error: 'Current password is wrong.' });
    const problem = passwordProblem(b.newPassword);
    if (problem) return reply.code(400).send({ error: problem });
    store.setPassword(user.id, await hashPassword(String(b.newPassword)));
    const token = startSession(reply, req, user); // the change signed everyone out; keep this device in
    return { ok: true, token };
  });

  // The People panel: an owner adds each person's own account (their own username, password, role and sessions).
  app.get('/api/users', { preHandler: requireOwner }, async () => ({ users: store.listUsers().map(adminUser) }));
  app.post('/api/users', { preHandler: requireOwner }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const err = validateNewUser(b);
    if (err) return reply.code(400).send({ error: err });
    if (!isRole(b.role)) return reply.code(400).send({ error: 'Choose a role: owner, contributor or readonly.' });
    if (store.userByUsername(String(b.username).trim())) return reply.code(409).send({ error: 'That username is taken.' });
    const u = store.createUser({
      username: String(b.username).trim(), displayName: String(b.displayName).trim(),
      passwordHash: await hashPassword(String(b.password)), role: b.role,
    });
    return { user: adminUser(u) };
  });

  // The guard that keeps the household from locking itself out: whatever you do to an account, at least one enabled owner remains.
  const wouldStrandOwners = (target: UserRow) => target.role === 'owner' && !target.disabled && store.enabledOwnerCount() <= 1;
  const targetOf = (req: FastifyRequest, reply: FastifyReply): UserRow | null => {
    const u = store.userById((req.params as { id: string }).id);
    if (!u) { void reply.code(404).send({ error: 'No such user.' }); return null; }
    return u;
  };

  app.post('/api/users/:id/disable', { preHandler: requireOwner }, async (req, reply) => {
    const target = targetOf(req, reply); if (!target) return;
    if (target.id === req.user!.id) return reply.code(400).send({ error: 'You can\'t disable your own account.' });
    if (wouldStrandOwners(target)) return reply.code(400).send({ error: 'That is the only owner; at least one must stay enabled.' });
    store.setDisabled(target.id, true);
    return { ok: true };
  });
  app.post('/api/users/:id/enable', { preHandler: requireOwner }, async (req, reply) => {
    const target = targetOf(req, reply); if (!target) return;
    store.setDisabled(target.id, false);
    return { ok: true };
  });
  app.post('/api/users/:id/role', { preHandler: requireOwner }, async (req, reply) => {
    const target = targetOf(req, reply); if (!target) return;
    const role: unknown = ((req.body ?? {}) as { role?: unknown }).role;
    if (!isRole(role)) return reply.code(400).send({ error: 'Choose a role: owner, contributor or readonly.' });
    if (role !== 'owner' && wouldStrandOwners(target)) return reply.code(400).send({ error: 'That is the only owner; at least one must stay.' });
    store.setRole(target.id, role as Role);
    return { ok: true };
  });
  // An owner setting someone else's password (e.g. forgotten). It signs that person out everywhere.
  app.post('/api/users/:id/password', { preHandler: requireOwner }, async (req, reply) => {
    const target = targetOf(req, reply); if (!target) return;
    const pw = ((req.body ?? {}) as { newPassword?: unknown }).newPassword;
    const problem = passwordProblem(pw);
    if (problem) return reply.code(400).send({ error: problem });
    store.setPassword(target.id, await hashPassword(String(pw)));
    return { ok: true };
  });
  // Remove an account for good. Their sessions end immediately. The shared household data is not affected.
  app.delete('/api/users/:id', { preHandler: requireOwner }, async (req, reply) => {
    const target = targetOf(req, reply); if (!target) return;
    if (target.id === req.user!.id) return reply.code(400).send({ error: 'You can\'t remove the account you are signed in with.' });
    if (wouldStrandOwners(target)) return reply.code(400).send({ error: 'That is the only owner; at least one must stay.' });
    store.deleteUser(target.id);
    return { ok: true };
  });

  // ---- sync ----
  // Pulling is allowed for every signed-in account, read-only included.
  app.get('/api/sync/pull', { preHandler: requireUser }, async (req) => {
    const q = req.query as { since?: string; limit?: string };
    const since = Math.max(0, Math.floor(Number(q.since ?? 0)) || 0);
    const limit = Math.min(5000, Math.max(1, Math.floor(Number(q.limit ?? 1000)) || 1000));
    const rows = store.changesSince(since, limit + 1);
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return {
      records: page.map((r) => ({ table: r.tbl, id: r.id, rev: r.rev, deleted: r.deleted, record: r.record })),
      rev: page.length ? page[page.length - 1].rev : since,
      serverRev: store.currentRev(),
      more,
    };
  });

  app.post('/api/sync/push', { preHandler: requireWriter }, async (req, reply) => {
    const b = (req.body ?? {}) as { changes?: unknown; deviceId?: unknown };
    if (!Array.isArray(b.changes)) return reply.code(400).send({ error: '"changes" must be a list.' });
    if (b.changes.length > 2000) return reply.code(413).send({ error: 'Too many changes in one push (max 2000).' });
    const deviceId = typeof b.deviceId === 'string' ? b.deviceId.slice(0, 100) : null;
    const results = applyPush(store, { userId: req.user!.id, deviceId }, b.changes);
    return { results, serverRev: store.currentRev() };
  });

  // ---- one-time bootstrap from a full app backup ----
  app.post('/api/admin/import', { preHandler: requireOwner }, async (req, reply) => {
    const q = req.query as { allowNonEmpty?: string };
    if (store.recordCount() > 0 && q.allowNonEmpty !== 'true') {
      return reply.code(409).send({ error: 'The server already holds data. Importing over it is refused unless allowNonEmpty=true.' });
    }
    return importBackup(store, { userId: req.user!.id }, req.body);
  });
  // "The device I'm on has the real data; make the server match it." Owner only; a database backup is taken first; refused if the
  // server has changed since the caller looked. Other devices converge through normal sync (the replaced records arrive as
  // tombstones), so nothing is physically erased.
  app.post('/api/admin/replace-data', { preHandler: requireOwner }, async (req, reply) => {
    const b = (req.body ?? {}) as { changes?: unknown; expectedRev?: unknown; deviceId?: unknown };
    if (!Array.isArray(b.changes)) return reply.code(400).send({ error: '"changes" must be a list.' });
    let backup: string | null = null;
    try {
      backup = backupNow(store, config.dataDir).file;
    } catch (e) {
      return reply.code(500).send({ error: `Could not take the safety backup first, so nothing was changed: ${e instanceof Error ? e.message : String(e)}` });
    }
    const summary = replaceAll(store, { userId: req.user!.id, deviceId: typeof b.deviceId === 'string' ? b.deviceId.slice(0, 100) : null }, b.changes, b.expectedRev);
    return { ...summary, backup: backup ? backup.split(/[\\/]/).pop() : null };
  });
  app.get('/api/admin/stats', { preHandler: requireOwner }, async () => ({ rev: store.currentRev(), tables: store.countsByTable() }));

  // ---- AI / lookup proxies (ported from the Netlify functions) ----
  registerAiRoutes(app, { requireUser });

  // ---- the built frontend, same origin as the API (so cookies "just work") ----
  if (config.frontendDir && fs.existsSync(config.frontendDir)) {
    void app.register(fastifyStatic, {
      root: config.frontendDir,
      wildcard: false,
      cacheControl: false,
      // Hashed build assets never change under the same name; everything else (the shell, service worker, manifest) must be
      // revalidated, or a redeploy would not reach installed copies.
      setHeaders: (res, filePath) => {
        const hashed = /[\\/]assets[\\/]/.test(filePath);
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found.' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html'); // BrowserRouter app: any non-API path is the shell
    });
  }

  return app;
}

const PENDING = '!pending'; // never verifies; replaced right after creation (hashing is async, creation must be in the tx)

function validateNewUser(b: Record<string, unknown>): string | null {
  const username = typeof b.username === 'string' ? b.username.trim() : '';
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(username)) return 'Username must be 2-40 letters, numbers, dots, dashes or underscores.';
  if (typeof b.displayName !== 'string' || !b.displayName.trim() || b.displayName.length > 80) return 'A display name is required.';
  return passwordProblem(b.password);
}
