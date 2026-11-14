import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';

/**
 * Detects "the database went back in time" (restored from an older backup, or swapped for an older copy).
 *
 * Devices remember the server's `epoch` and, when it changes, discard their bookkeeping about what the server holds (keeping all
 * their data) and reconcile from scratch. Revision numbers alone cannot do this: after a restore, another device may re-send its data
 * and push the revision back up past a third device's cursor, which would then silently miss everything below it.
 *
 * A backup is a copy of the database, so it carries the same epoch it had when it was taken -- the epoch inside the database cannot
 * reveal a restore. What does is a HIGH-WATER MARK kept in a sidecar file (`epoch.json`) that is NOT part of any backup: the epoch
 * plus the highest revision this folder has ever served, refreshed after every write. At startup, a database whose revision is lower
 * than the mark has been rolled back; a new epoch is minted and written to both.
 *
 * Limits: restoring a copy whose revision is at or above the mark (e.g. one from another machine) is not detected; the server must
 * be stopped while a database file is swapped (the deploy notes say so).
 */
interface Mark { epoch: string; rev: number }

const markFile = (dataDir: string) => path.join(dataDir, 'epoch.json');
function readMark(dataDir: string): Mark | null {
  try {
    const m = JSON.parse(fs.readFileSync(markFile(dataDir), 'utf8')) as Partial<Mark>;
    return typeof m.epoch === 'string' && typeof m.rev === 'number' ? { epoch: m.epoch, rev: m.rev } : null;
  } catch { return null; }
}
function writeMark(dataDir: string, m: Mark) {
  const tmp = `${markFile(dataDir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m));
  fs.renameSync(tmp, markFile(dataDir)); // never leaves a half-written mark
}

export function ensureEpoch(store: Store, dataDir: string, log: (m: string) => void = console.log): { epoch: string; rotated: boolean } {
  const mark = readMark(dataDir);
  const rev = store.currentRev();
  if (!mark) {
    writeMark(dataDir, { epoch: store.epoch(), rev });
    return { epoch: store.epoch(), rotated: false };
  }
  if (rev < mark.rev || mark.epoch !== store.epoch()) {
    const next = store.rotateEpoch();
    writeMark(dataDir, { epoch: next, rev });
    log(`Meal Planner server: the database is at revision ${rev} but this folder has already served revision ${mark.rev} (restored from a backup?). New epoch ${next}; devices will re-sync from scratch.`);
    return { epoch: next, rotated: true };
  }
  return { epoch: store.epoch(), rotated: false };
}

/** Returns a function to call after any write: it moves the high-water mark up (never down). Cheap: a no-op unless the revision grew. */
export function highWaterRecorder(store: Store, dataDir: string): () => void {
  let last = readMark(dataDir)?.rev ?? -1;
  return () => {
    const rev = store.currentRev();
    if (rev <= last) return;
    try { writeMark(dataDir, { epoch: store.epoch(), rev }); last = rev; } catch (e) { console.error('Meal Planner server: could not update epoch.json:', e); }
  };
}
