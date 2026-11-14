import {
  AuthError, ForbiddenError, NetworkError,
  type PullPage, type PushChange, type PushResult, type ReplaceResult, type Transport,
} from './engine';

/** Talks to the Meal Planner server over fetch. Same-origin only: the app is served BY the server (or reaches it through the dev
 * server's proxy), so the session cookie and the server's origin check just work and there is no CORS surface. */
export type Role = 'owner' | 'contributor' | 'readonly';
export interface ServerUser { id: string; username: string; displayName: string; role: Role }
/** What an owner sees for each account. */
export interface ManagedUser extends ServerUser { disabled: boolean; createdAt: string }
export type Availability = 'unavailable' | 'signed-out' | 'signed-in';

/** Where the session token is kept. In the app: localStorage, as a fallback to the session cookie. Home-screen web apps run in a
 * separate storage context and are known to drop Set-Cookie session cookies -- the sign-in then "succeeds" but the app looks
 * signed-out again at once. localStorage does not have that problem, so every sign-in returns the raw token too; we keep a copy and
 * send it as an Authorization header on every request. The server accepts either. */
export interface TokenStore { get(): string | null; set(token: string | null): void }
const TOKEN_KEY = 'mp_session_token';
export const localStorageTokens: TokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (token) => { try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ServerApi implements Transport {
  private readonly deviceId: string;
  private readonly fetchFn: typeof fetch;
  private readonly base: string;
  private readonly tokens: TokenStore;
  constructor(deviceId: string, opts: { fetchFn?: typeof fetch; base?: string; tokens?: TokenStore } = {}) {
    this.deviceId = deviceId;
    this.fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
    this.base = opts.base ?? '';
    this.tokens = opts.tokens ?? localStorageTokens;
  }

  private async call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response> {
    const token = this.tokens.get();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const started = Date.now();
    const attempt = () => this.fetchFn(`${this.base}${path}`, {
      method,
      credentials: 'same-origin',
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    try {
      // A fetch that rejects within a few ms never reached the network. Home-screen web apps do this right after a cold launch or
      // resume, while the process's network session is still initializing. Ride that window out with delayed retries (0.4 s,
      // 1.5 s, 4 s). Reads are always retried; a write only when it provably failed before any I/O, which makes repeating it
      // safe (and push is idempotent anyway).
      const delays = [400, 1500, 4000];
      for (let i = 0; ; i++) {
        const t0 = Date.now();
        try {
          return await attempt();
        } catch (err) {
          const instant = Date.now() - t0 < 100;
          if (i >= delays.length || (method !== 'GET' && !instant)) throw err;
          await new Promise((r) => setTimeout(r, delays[i]));
        }
      }
    } catch (e) {
      // Keep the browser's own reason ("Failed to fetch", "Load failed"...): fetch throws the same generic-looking error for a
      // dropped connection, a blocked request and a TLS problem, and that detail is the only way to tell them apart from the UI.
      const online = typeof navigator !== 'undefined' ? (navigator.onLine ? 'online' : 'offline') : 'n/a';
      throw new NetworkError(`${e instanceof Error ? `${e.name}: ${e.message}` : String(e)} [${method} ${path.split('?')[0]}, ${Date.now() - started} ms, ${online}]`);
    }
  }

  private async json<T>(res: Response): Promise<T> {
    if (res.status === 401) throw new AuthError('signed out');
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new Error(`The server sent something unexpected (HTTP ${res.status}).`);
    const data = (await res.json()) as T & { error?: string };
    if (res.status === 403) throw new ForbiddenError(data.error ?? 'You do not have permission to do that.');
    if (!res.ok) throw new Error(data.error ?? `Server error (HTTP ${res.status}).`);
    return data;
  }

  /** Is there a Meal Planner server behind this origin, and are we signed in? A plain static host answers with HTML -> unavailable. */
  async availability(): Promise<{ state: Availability; user?: ServerUser; needsSetup?: boolean }> {
    let health: Response;
    try { health = await this.call('GET', '/api/health'); } catch { return { state: 'unavailable' }; }
    if (!health.ok || !(health.headers.get('content-type') ?? '').includes('json')) return { state: 'unavailable' };
    const h = (await health.json()) as { ok?: boolean; needsSetup?: boolean };
    if (!h.ok) return { state: 'unavailable' };
    const me = await this.call('GET', '/api/me');
    if (me.status === 401) return { state: 'signed-out', needsSetup: h.needsSetup };
    const data = await this.json<{ user: ServerUser }>(me);
    return { state: 'signed-in', user: data.user };
  }

  async login(username: string, password: string): Promise<ServerUser> {
    const res = await this.call('POST', '/api/auth/login', { username, password });
    if (res.status === 401) throw new Error('Wrong username or password.');
    const data = await this.json<{ user: ServerUser; token?: string }>(res);
    if (data.token) this.tokens.set(data.token);
    return data.user;
  }
  /** First run only: creates the first account, who is the owner. */
  async setup(username: string, displayName: string, password: string): Promise<ServerUser> {
    const data = await this.json<{ user: ServerUser; token?: string }>(await this.call('POST', '/api/auth/setup', { username, displayName, password }));
    if (data.token) this.tokens.set(data.token);
    return data.user;
  }
  async logout(): Promise<void> {
    try { await this.call('POST', '/api/auth/logout', {}); } finally { this.tokens.set(null); }
  }

  // ---- accounts ----
  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    // Changing the password signs out every other session and starts a fresh one for this device; pick up its new token so this
    // device's Authorization header doesn't go stale on the very next request.
    const data = await this.json<{ ok: true; token?: string }>(await this.call('POST', '/api/auth/password', { currentPassword, newPassword }));
    if (data.token) this.tokens.set(data.token);
  }
  async listUsers(): Promise<ManagedUser[]> {
    return (await this.json<{ users: ManagedUser[] }>(await this.call('GET', '/api/users'))).users;
  }
  async createUser(u: { username: string; displayName: string; password: string; role: Role }): Promise<ManagedUser> {
    return (await this.json<{ user: ManagedUser }>(await this.call('POST', '/api/users', u))).user;
  }
  async setUserDisabled(id: string, disabled: boolean): Promise<void> {
    await this.json(await this.call('POST', `/api/users/${encodeURIComponent(id)}/${disabled ? 'disable' : 'enable'}`, {}));
  }
  async setUserRole(id: string, role: Role): Promise<void> {
    await this.json(await this.call('POST', `/api/users/${encodeURIComponent(id)}/role`, { role }));
  }
  async resetUserPassword(id: string, newPassword: string): Promise<void> {
    await this.json(await this.call('POST', `/api/users/${encodeURIComponent(id)}/password`, { newPassword }));
  }
  async removeUser(id: string): Promise<void> {
    await this.json(await this.call('DELETE', `/api/users/${encodeURIComponent(id)}`));
  }

  // ---- sync ----
  async pull(since: number, limit: number): Promise<PullPage> {
    // If a big page can't get through (fetch-level failure), ask for smaller ones before giving up. Pages are cursor-based, so any
    // size is correct; the engine just continues from the returned `rev`.
    let lastErr: unknown;
    for (const n of [limit, 100, 25]) {
      if (n > limit) continue;
      try {
        return await this.json<PullPage>(await this.call('GET', `/api/sync/pull?since=${since}&limit=${n}`));
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }
  async replaceServerData(changes: PushChange[], expectedRev: number): Promise<ReplaceResult> {
    return this.json(await this.call('POST', '/api/admin/replace-data', { changes, expectedRev, deviceId: this.deviceId }));
  }
  async push(changes: PushChange[]): Promise<{ results: PushResult[]; serverRev: number }> {
    return this.json(await this.call('POST', '/api/sync/push', { deviceId: this.deviceId, changes }));
  }
}
