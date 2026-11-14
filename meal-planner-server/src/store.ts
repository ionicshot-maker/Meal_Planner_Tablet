import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

/** Every client table the server stores. Names match the app's IndexedDB stores exactly, so the client needs no mapping.
 * `mealPlanDays` is keyed by its date (the client sends it as the record id); `settings` is the one-row singleton. */
export const SYNC_TABLES = [
  'ingredients', 'recipes', 'mealPlanDays', 'groceryLists', 'householdItems', 'collections', 'references', 'settings',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export const isSyncTable = (t: unknown): t is SyncTable => typeof t === 'string' && (SYNC_TABLES as readonly string[]).includes(t);

export const ROLES = ['owner', 'contributor', 'readonly'] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (r: unknown): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r);

export interface UserRow { id: string; username: string; display_name: string; password_hash: string; role: Role; disabled: number; created_at: string }
export interface StoredRecord { tbl: SyncTable; id: string; rev: number; deleted: boolean; record: Record<string, unknown> }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'contributor', 'readonly')),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS records (
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  device_id TEXT,
  user_id TEXT,
  PRIMARY KEY (tbl, id)
);
CREATE INDEX IF NOT EXISTS idx_records_rev ON records(rev);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO meta(key, value) VALUES ('rev', '0');
`;

export class Store {
  readonly db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);
    if (!this.db.prepare("SELECT 1 FROM meta WHERE key = 'epoch'").get()) {
      this.db.prepare("INSERT INTO meta(key, value) VALUES ('epoch', ?)").run(crypto.randomUUID());
    }
  }

  close() { this.db.close(); }

  /** Identifies this incarnation of the database. Changes when the file is replaced (see epoch.ts). */
  epoch(): string {
    return (this.db.prepare("SELECT value FROM meta WHERE key = 'epoch'").get() as { value: string }).value;
  }
  rotateEpoch(): string {
    const next = crypto.randomUUID();
    this.db.prepare("UPDATE meta SET value = ? WHERE key = 'epoch'").run(next);
    return next;
  }

  /** Runs fn in one IMMEDIATE transaction: all of it lands or none of it does. */
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---- users / sessions ----
  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }
  createUser(u: { username: string; displayName: string; passwordHash: string; role: Role }): UserRow {
    const row: UserRow = {
      id: crypto.randomUUID(), username: u.username, display_name: u.displayName, password_hash: u.passwordHash,
      role: u.role, disabled: 0, created_at: new Date().toISOString(),
    };
    this.db.prepare('INSERT INTO users(id, username, display_name, password_hash, role, disabled, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(row.id, row.username, row.display_name, row.password_hash, row.role, row.disabled, row.created_at);
    return row;
  }
  userByUsername(username: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  }
  userById(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }
  listUsers(): UserRow[] {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at').all() as unknown as UserRow[];
  }
  /** Used once at first-run setup (the row is created inside the transaction before the async hash is ready). */
  setPasswordHashOnly(userId: string, passwordHash: string) {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  }
  setPassword(userId: string, passwordHash: string) {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); // a password change signs everyone out
  }
  /** Enabled owners: the accounts that could lock everyone else out if the last one were removed or demoted. */
  enabledOwnerCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND disabled = 0").get() as { n: number }).n;
  }
  setRole(userId: string, role: Role) {
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }
  /** Removes the account and every session it has. The household's data is shared and is NOT touched. */
  deleteUser(userId: string) {
    this.tx(() => {
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.db.prepare('UPDATE records SET user_id = NULL WHERE user_id = ?').run(userId); // keep the rows; just forget who wrote them
      this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
  }
  setDisabled(userId: string, disabled: boolean) {
    this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, userId);
    if (disabled) this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  createSession(userId: string, days: number, userAgent: string | null): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    this.db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen, user_agent) VALUES (?,?,?,?,?,?)')
      .run(hashToken(token), userId, now.toISOString(), new Date(now.getTime() + days * 86_400_000).toISOString(), now.toISOString(), userAgent);
    return token;
  }
  /** The live user behind a session token, or undefined if unknown/expired/disabled. */
  sessionUser(token: string): UserRow | undefined {
    const row = this.db.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`
    ).get(hashToken(token), new Date().toISOString()) as UserRow | undefined;
    if (row) this.db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(new Date().toISOString(), hashToken(token));
    return row;
  }
  deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  purgeExpiredSessions() {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  }

  // ---- records ----
  currentRev(): number {
    return Number((this.db.prepare("SELECT value FROM meta WHERE key = 'rev'").get() as { value: string }).value);
  }
  /** Must be called inside tx(). */
  nextRev(): number {
    const next = this.currentRev() + 1;
    this.db.prepare("UPDATE meta SET value = ? WHERE key = 'rev'").run(String(next));
    return next;
  }
  getRecord(tbl: SyncTable, id: string): StoredRecord | undefined {
    const r = this.db.prepare('SELECT data, rev, deleted FROM records WHERE tbl = ? AND id = ?').get(tbl, id) as
      { data: string; rev: number; deleted: number } | undefined;
    return r ? { tbl, id, rev: r.rev, deleted: !!r.deleted, record: JSON.parse(r.data) } : undefined;
  }
  /** Must be called inside tx(). Returns the new revision. A record carrying a `deletedAt` is a tombstone. */
  putRecord(tbl: SyncTable, id: string, record: Record<string, unknown>, who: { userId: string | null; deviceId: string | null }): number {
    const rev = this.nextRev();
    this.db.prepare(
      `INSERT INTO records(tbl, id, data, rev, deleted, updated_at, device_id, user_id) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data, rev = excluded.rev, deleted = excluded.deleted,
         updated_at = excluded.updated_at, device_id = excluded.device_id, user_id = excluded.user_id`
    ).run(tbl, id, JSON.stringify(record), rev, record.deletedAt ? 1 : 0, new Date().toISOString(), who.deviceId, who.userId);
    return rev;
  }
  changesSince(since: number, limit: number): StoredRecord[] {
    const rows = this.db.prepare('SELECT tbl, id, data, rev, deleted FROM records WHERE rev > ? ORDER BY rev ASC LIMIT ?')
      .all(since, limit) as unknown as { tbl: SyncTable; id: string; data: string; rev: number; deleted: number }[];
    return rows.map((r) => ({ tbl: r.tbl, id: r.id, rev: r.rev, deleted: !!r.deleted, record: JSON.parse(r.data) }));
  }
  /** Keys of every record that is currently live (not a tombstone). */
  liveKeys(): { tbl: SyncTable; id: string }[] {
    return this.db.prepare('SELECT tbl, id FROM records WHERE deleted = 0').all() as unknown as { tbl: SyncTable; id: string }[];
  }
  recordCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
  }
  countsByTable(): Record<string, { live: number; deleted: number }> {
    const rows = this.db.prepare('SELECT tbl, deleted, COUNT(*) AS n FROM records GROUP BY tbl, deleted').all() as unknown as { tbl: string; deleted: number; n: number }[];
    const out: Record<string, { live: number; deleted: number }> = {};
    for (const r of rows) (out[r.tbl] ??= { live: 0, deleted: 0 })[r.deleted ? 'deleted' : 'live'] = r.n;
    return out;
  }
}

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
