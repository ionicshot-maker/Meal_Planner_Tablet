import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.js';

/**
 * Consistent online backups of the SQLite database. `VACUUM INTO` writes a complete, defragmented copy as a single file while the
 * server keeps running (it takes a read snapshot; writers are not blocked in WAL mode), so there is no need to stop the service
 * or to copy the -wal/-shm sidecar files by hand.
 */
export const BACKUP_PREFIX = 'meal-planner-';

export function backupDir(dataDir: string) {
  return path.join(dataDir, 'backups');
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Optional second copy on a mapped network drive (e.g. a UNC path on the NAS). The app never sees NAS credentials: Windows holds them. */
export interface NasOptions { path: string | null | undefined; keep: number; log?: (m: string) => void }
export interface NasResult { copied: boolean; path: string; pruned: number; error?: string }

/** Deletes all but the newest `keep` backups in any folder. Returns how many were removed. */
function pruneDir(dir: string, keep: number): number {
  if (!fs.existsSync(dir) || keep < 1) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.sqlite')).sort();
  const doomed = files.slice(0, Math.max(0, files.length - keep));
  for (const f of doomed) fs.rmSync(path.join(dir, f));
  return doomed.length;
}

/** Copies one finished backup to the NAS folder and prunes that folder by the same keep-count. NEVER throws. */
export function copyToNas(file: string, nas: NasOptions): NasResult | null {
  const target = (nas.path ?? '').trim();
  if (!target) return null;
  const log = nas.log ?? ((m: string) => console.warn(m));
  const tmp = path.join(target, `${path.basename(file)}.partial`);
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(file, tmp);                       // a half-copied file never looks like a backup (prune ignores .partial)
    fs.renameSync(tmp, path.join(target, path.basename(file)));
    let pruned = 0;
    try { pruned = pruneDir(target, nas.keep); } catch (e) { log(`NAS backup prune failed: ${e instanceof Error ? e.message : String(e)}`); }
    return { copied: true, path: target, pruned };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try { fs.rmSync(tmp, { force: true }); } catch { /* the drive may be gone */ }
    log(`NAS backup copy failed: ${error} - local backup still saved to ${file}`);
    return { copied: false, path: target, pruned: 0, error };
  }
}

/** Writes one backup and returns its path. Verifies it opens and reports a revision before declaring success.
 * With `nas`, the finished file is then also copied there; a NAS problem is logged and never affects the local backup. */
export function backupNow(store: Store, dataDir: string, now = new Date(), nas?: NasOptions): { file: string; bytes: number; records: number; nas?: NasResult } {
  const dir = backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${BACKUP_PREFIX}${stamp(now)}.sqlite`);
  const tmp = `${file}.partial`;
  if (fs.existsSync(tmp)) fs.rmSync(tmp);
  store.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  // Verify before it counts: open the copy and read it back.
  const check = new DatabaseSync(tmp, { readOnly: true });
  let records: number;
  try {
    const row = check.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number };
    const ok = check.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (ok.integrity_check !== 'ok') throw new Error(`backup integrity check failed: ${ok.integrity_check}`);
    records = row.n;
  } finally {
    check.close();
  }
  fs.renameSync(tmp, file);
  const nasResult = nas ? copyToNas(file, nas) : null;
  return { file, bytes: fs.statSync(file).size, records, ...(nasResult ? { nas: nasResult } : {}) };
}

/** Deletes all but the newest `keep` backups. Returns how many were removed. */
export function pruneBackups(dataDir: string, keep: number): number {
  const dir = backupDir(dataDir);
  if (!fs.existsSync(dir) || keep < 1) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.sqlite')).sort(); // timestamped names sort by age
  const doomed = files.slice(0, Math.max(0, files.length - keep));
  for (const f of doomed) fs.rmSync(path.join(dir, f));
  return doomed.length;
}

/** Milliseconds until the next local `hour:00` (always in the future). */
export function msUntilHour(hour: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Runs a backup every night at `hour` local time. Returns a function that stops it. Failures are logged, never fatal. */
export function scheduleNightlyBackup(store: Store, opts: { dataDir: string; keep: number; hour: number; nasPath?: string | null; log?: (m: string) => void }): () => void {
  const log = opts.log ?? ((m: string) => console.log(m));
  let timer: NodeJS.Timeout;
  const arm = () => {
    timer = setTimeout(() => {
      try {
        const r = backupNow(store, opts.dataDir, new Date(), { path: opts.nasPath, keep: opts.keep, log });
        const pruned = pruneBackups(opts.dataDir, opts.keep);
        log(`Meal Planner backup: ${path.basename(r.file)} (${r.records} records, ${(r.bytes / 1024).toFixed(0)} KB); pruned ${pruned} old.${r.nas?.copied ? ` Copied to NAS ${r.nas.path} (pruned ${r.nas.pruned}).` : ''}`);
      } catch (e) {
        log(`Meal Planner backup FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
      arm();
    }, msUntilHour(opts.hour));
    timer.unref();
  };
  arm();
  return () => clearTimeout(timer);
}
