import path from 'node:path';

/**
 * Everything environment-specific lives here, so the exposure layer (Tailscale Serve, a LAN address...) is purely a deployment
 * choice: the app only ever listens on HOST:PORT over plain HTTP and is told which origins it is reachable at. TLS is
 * terminated by whatever sits in front of it. (Same pattern, and the same variable names, as bill-planner-server -- each
 * instance has its own env file, so sharing names never collides.)
 */
export interface Config {
  host: string;
  port: number;
  /** Folder holding the SQLite file and its nightly backups. */
  dataDir: string;
  /** The canonical origin users type, e.g. https://angelo-server.tail1234.ts.net:8447. */
  publicOrigin: string;
  /** Every origin a browser may use to reach this server (the canonical one first). Writes from any other Origin are refused. */
  allowedOrigins: string[];
  /** Honour X-Forwarded-* from the reverse proxy in front of us. Only enable when one actually is. */
  trustProxy: boolean;
  /** Built frontend (Meal Planner's `dist`) to serve from the same origin, or null for API-only. */
  frontendDir: string | null;
  sessionDays: number;
  /** Keep this many nightly database backups (0 disables the built-in backup). */
  backupKeep: number;
  /** Local hour (0-23) at which the nightly backup runs. */
  backupHour: number;
  /** Optional second backup destination, typically a UNC path on the NAS. null = off. */
  nasBackupPath: string | null;
}

const origin = (v: string, what: string) => {
  let u: URL;
  try { u = new URL(v.trim()); } catch { throw new Error(`${what} is not a valid URL: ${v}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`${what} must be http(s): ${v}`);
  return u.origin;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8791);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT is not a valid port: ${env.PORT}`);
  const publicOrigin = origin(env.PUBLIC_ORIGIN ?? `http://localhost:${port}`, 'PUBLIC_ORIGIN');
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => origin(s, 'ALLOWED_ORIGINS'));
  return {
    host: env.HOST ?? '127.0.0.1', // loopback by default: nothing is reachable until you deliberately put a proxy in front
    port,
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    publicOrigin,
    allowedOrigins: [publicOrigin, ...extra.filter((o) => o !== publicOrigin)],
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    frontendDir: env.FRONTEND_DIR ? path.resolve(env.FRONTEND_DIR) : null,
    sessionDays: Number(env.SESSION_DAYS ?? 60),
    backupKeep: Number(env.BACKUP_KEEP ?? 14),
    backupHour: Number(env.BACKUP_HOUR ?? 3),
    nasBackupPath: (env.NAS_BACKUP_PATH ?? '').trim().replace(/^"(.*)"$/, '$1') || null,
  };
}

export const isSecureOrigin = (c: Pick<Config, 'publicOrigin'>) => c.publicOrigin.startsWith('https://');
