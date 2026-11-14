/**
 * Client sync engine. Pure logic: it talks to a `LocalStore` (IndexedDB in the app, a Map in tests) and a `Transport`
 * (fetch in the app, the real server's inject() in tests), so the exact same code is exercised by both.
 * Same model as Bill Planner's engine, adapted to Meal Planner's plain records (see records.ts).
 *
 *  - Local-first: the app always reads/writes IndexedDB. Sync is a background reconcile with the server.
 *  - For every record exchanged with the server the device remembers `{ rev, hash }`: the server revision it last saw and a hash
 *    of the record's content then. A record is DIRTY when its hash differs (or it was never exchanged).
 *  - DELETES ARE DETECTED BY ABSENCE: the app really deletes rows, it has no soft-delete. A record this device has exchanged
 *    before but no longer holds is a deletion, and is pushed as a tombstone -- behind a guard: a big batch of deletions (a reset,
 *    a restore-replace) is held back until the person confirms, so one device can never silently wipe the household.
 *  - Cycle: PULL everything past the cursor and apply it, then PUSH what is dirty (with `baseRev` = the rev last seen).
 *  - Conflict (both sides changed one record): the newer `updatedAt` wins (ties -> server); the loser is kept in a conflict log.
 *  - A new incoming ingredient/recipe whose NAME matches a different local record is not applied: it is held for review
 *    (the same duplicate review the app has always had). Detection lives here, on pull, because the server stores opaque JSON.
 *  - A device that has NEVER synced does not merge into a server that already has data (that would duplicate everything that was
 *    created independently on each side). It stops and asks; the only way forward is to adopt the server's data.
 */
import {
  contentHash, DELETED_HASH, HELD_HASH, NAMED_TABLES, normName, tombstone, type SyncTable, type WireRec,
} from './records';

export interface RemoteRecord { table: SyncTable; id: string; rev: number; deleted: boolean; record: WireRec }
export interface PushChange { table: SyncTable; id: string; record: WireRec; baseRev: number }
/** A change found locally. `isDelete` = a tombstone for a record that has disappeared from this device. */
export interface DirtyChange extends PushChange { isDelete: boolean }
export interface SyncStateEntry { rev: number; hash: string; held?: boolean; deleted?: boolean }
export interface LocalView { record?: WireRec; state?: SyncStateEntry; dirty: boolean; dirtyDelete: boolean }
export interface HeldDuplicate {
  key: string; // `${table}|${cloudId}`
  table: 'ingredients' | 'recipes';
  cloudId: string; localId: string; rev: number; cloud: WireRec; at: string;
}
export interface ConflictLog { table: SyncTable; id: string; at: string; kept: 'local' | 'server'; local: WireRec | null; server: WireRec }
export interface AdoptItem { table: SyncTable; id: string; rev: number; deleted: boolean; record: WireRec }
export interface PullPlan {
  adopt: AdoptItem[];
  keepLocal: { table: SyncTable; id: string; rev: number }[];
  conflicts: ConflictLog[];
  hold: HeldDuplicate[];
  /** Keys of held duplicates that are resolved by this plan (adopted, or deleted on the server). */
  releaseHeld: string[];
}

export interface LocalStore {
  getCursor(): Promise<number>;
  isNeverSynced(): Promise<boolean>;
  getMany(keys: { table: SyncTable; id: string }[]): Promise<Map<string, LocalView>>;
  listDirty(): Promise<DirtyChange[]>;
  /** Atomically: apply adopted records (raw -- never re-stamping `updatedAt`) + their remembered state, move the rev of kept-local
   * records, log conflicts, record/release held duplicates, and (when not null) advance the cursor. */
  commitPull(plan: PullPlan, cursor: number | null): Promise<void>;
  /** Remember that these records are now what the server holds at `rev` (a tombstone record means "deleted on both sides"). */
  markPushed(items: { table: SyncTable; id: string; rev: number; record: WireRec }[]): Promise<void>;
  /** Forget this device's synced-ness and clear its data so the server's data can be adopted cleanly. */
  wipeForAdopt(): Promise<void>;
  getSeenRev(): Promise<number>;
  noteServerRev(rev: number): Promise<void>;
  /** The server incarnation this device last talked to (changes when the server's database file is replaced). */
  getEpoch(): Promise<string | undefined>;
  noteEpoch(epoch: string): Promise<void>;
  /** Forget what the server is believed to hold (every record becomes "never sent", the cursor goes to 0) but KEEP all data. */
  resetSyncState(): Promise<void>;
  /** normalized name -> id of the local records of an ingredients/recipes table (for duplicate-name detection). */
  nameIndex(table: SyncTable): Promise<Map<string, string>>;
  /** How many live records per table this device has exchanged with the server (the denominator for the delete guard). */
  trackedCounts(): Promise<Record<string, number>>;
  /** Undo this device's pending deletions: forget the sync state of records that are gone locally and reset the cursor, so the
   * next pull brings them back from the server. Returns how many were forgotten. */
  forgetLocalDeletions(): Promise<number>;
}

export interface PullPage { records: RemoteRecord[]; rev: number; serverRev: number; more: boolean; epoch?: string }
export type PushResult =
  | { table: string; id: string; status: 'accepted' | 'unchanged'; rev: number }
  | { table: string; id: string; status: 'conflict'; rev: number; serverRecord: WireRec }
  | { table: string; id: string; status: 'rejected'; reason: string };
export interface ReplaceResult { upserted: number; tombstoned: number; backup: string | null }
export interface Transport {
  pull(since: number, limit: number): Promise<PullPage>;
  /** Owner-only: make the server's data match `changes` (what the server has beyond them is tombstoned). Throws if the server's
   * revision is no longer `expectedRev`. The server backs itself up first. */
  replaceServerData(changes: PushChange[], expectedRev: number): Promise<ReplaceResult>;
  push(changes: PushChange[]): Promise<{ results: PushResult[]; serverRev: number }>;
}
export class AuthError extends Error {}
export class NetworkError extends Error {}
/** The server refused a write because this account is read-only (or lacks the role for it). */
export class ForbiddenError extends Error {}

export type SyncStatus = 'ok' | 'needs-adopt' | 'needs-delete-confirm' | 'signed-out' | 'offline' | 'read-only' | 'error';

export interface SyncOutcome {
  status: SyncStatus;
  pulled: number;        // records applied locally from the server
  pushed: number;        // records the server accepted from us
  conflicts: number;     // conflicts resolved this cycle (see the conflict log)
  held: number;          // incoming records held back for duplicate review this cycle
  changedLocal: boolean; // true when local data was rewritten and the UI should refresh
  rejected: string[];
  /** Set when deletions are being held back: how many per table. Nothing is deleted on the server until confirmed. */
  pendingDeletes?: Record<string, number>;
  message?: string;
}

/** A single sync never sends more than this many deletions without confirmation... */
export const MAX_UNCONFIRMED_DELETES = 50;
/** ...nor this share of a table (once at least MIN_FOR_SHARE are being deleted, so removing one of three recipes is not "mass"). */
export const MAX_DELETE_SHARE = 0.25;
export const MIN_FOR_SHARE = 5;

const key = (table: string, id: string) => `${table}|${id}`;

export class SyncEngine {
  private readonly pageSize: number;
  private readonly pushBatch = 200;
  private readonly now: () => string;
  private readonly local: LocalStore;
  private readonly api: Transport;
  /** Per-cycle cache of local name indexes, kept current as records are adopted. */
  private names = new Map<string, Map<string, string>>();

  constructor(local: LocalStore, api: Transport, opts: { pageSize?: number; now?: () => string } = {}) {
    this.local = local;
    this.api = api;
    this.pageSize = opts.pageSize ?? 300;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  private fresh(changedLocal = false): SyncOutcome {
    return { status: 'ok', pulled: 0, pushed: 0, conflicts: 0, held: 0, changedLocal, rejected: [] };
  }

  /** One full reconcile cycle. Never throws: every failure becomes a status. */
  async syncOnce(opts: { confirmDeletes?: boolean } = {}): Promise<SyncOutcome> {
    const out = this.fresh();
    try {
      if (await this.local.isNeverSynced()) {
        const probe = await this.api.pull(0, 1);
        if (probe.serverRev > 0) return { ...out, status: 'needs-adopt', message: 'The household already has data on the server and this device has never synced.' };
      }
      await this.pullAll(out, false);
      // Pushing can surface conflicts that resolve in our favour and need one more push with the server's rev.
      for (let round = 0; round < 4; round++) {
        const pushable = await this.pushable(await this.local.listDirty(), opts.confirmDeletes === true, out);
        if (pushable.length === 0) break;
        if (!(await this.pushAll(pushable, out))) break;
      }
      if (out.pendingDeletes) {
        out.status = 'needs-delete-confirm';
        const n = Object.values(out.pendingDeletes).reduce((a, b) => a + b, 0);
        out.message = `This device removed ${n} item${n === 1 ? '' : 's'} since it last synced. They have not been removed for anyone else yet.`;
      }
      return out;
    } catch (e) {
      return this.failure(out, e);
    }
  }

  /** Splits off big batches of deletions (see the guard constants). Records what is being held in `out.pendingDeletes`. */
  private async pushable(dirty: DirtyChange[], confirmed: boolean, out: SyncOutcome): Promise<PushChange[]> {
    const deletes = dirty.filter((d) => d.isDelete);
    out.pendingDeletes = undefined;
    if (deletes.length > 0 && !confirmed) {
      const perTable: Record<string, number> = {};
      for (const d of deletes) perTable[d.table] = (perTable[d.table] ?? 0) + 1;
      const tracked = await this.local.trackedCounts();
      const big = deletes.length > MAX_UNCONFIRMED_DELETES
        || Object.entries(perTable).some(([t, n]) => n >= MIN_FOR_SHARE && n > MAX_DELETE_SHARE * (tracked[t] ?? 0));
      if (big) {
        out.pendingDeletes = perTable;
        return dirty.filter((d) => !d.isDelete).map(toPush);
      }
    }
    return dirty.map(toPush);
  }

  /**
   * Confirmed by an owner, for a device that has NEVER synced but holds the real data while the server holds something else
   * (typically another device signed in first and pushed only starter data). The server is made to match this device:
   * everything here is written, and what the server has beyond it is tombstoned (never erased), so other devices converge
   * through ordinary pulls. The server takes its own backup first and refuses if it changed since we looked.
   * Nothing on this device is modified or removed.
   */
  async makeServerMatchThisDevice(): Promise<SyncOutcome> {
    const out = this.fresh();
    try {
      if (!(await this.local.isNeverSynced())) throw new Error('This is only for a device that has never synced.');
      const probe = await this.api.pull(0, 1);
      const changes = (await this.local.listDirty()).map(toPush);
      if (changes.length === 0) throw new Error('This device has no data to put on the server.');
      const res = await this.api.replaceServerData(changes, probe.serverRev);
      out.pushed = res.upserted;
      await this.local.resetSyncState();
      await this.pullAll(out, false); // everything is content-identical, so this just records the server's revisions
      out.message = `The server now matches this device (${res.upserted} records written, ${res.tombstoned} other records retired). Server backup taken first: ${res.backup ?? 'n/a'}.`;
      return out;
    } catch (e) {
      return this.failure(out, e);
    }
  }

  /** Confirmed by the person: replace this device's data with the server's. The caller is expected to have saved a backup. */
  async adoptServerData(): Promise<SyncOutcome> {
    const out = this.fresh(true);
    try {
      await this.local.wipeForAdopt();
      await this.pullAll(out, true);
      return out;
    } catch (e) {
      return this.failure(out, e);
    }
  }

  /** "Put them back": cancels this device's held-back deletions by re-fetching those records from the server. */
  async restoreDeletedFromServer(): Promise<SyncOutcome> {
    const out = this.fresh(true);
    try {
      const n = await this.local.forgetLocalDeletions();
      await this.pullAll(out, false);
      out.message = n ? `Brought ${n} removed item${n === 1 ? '' : 's'} back from the server.` : 'Nothing needed restoring.';
      return out;
    } catch (e) {
      return this.failure(out, e);
    }
  }

  private failure(out: SyncOutcome, e: unknown): SyncOutcome {
    if (e instanceof AuthError) return { ...out, status: 'signed-out', message: 'Signed out.' };
    if (e instanceof ForbiddenError) return { ...out, status: 'read-only', message: e.message };
    if (e instanceof NetworkError) {
      return { ...out, status: 'offline', message: `The server can't be reached; changes stay on this device and sync later. (${e.message})` };
    }
    return { ...out, status: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  private async pullAll(out: SyncOutcome, forceServer: boolean) {
    this.names = new Map();
    let cursor = await this.local.getCursor();
    for (;;) {
      const page = await this.api.pull(cursor, this.pageSize);
      const seen = Math.max(cursor, await this.local.getSeenRev());
      const knownEpoch = await this.local.getEpoch();
      const epochChanged = !!page.epoch && !!knownEpoch && page.epoch !== knownEpoch;
      if (epochChanged || page.serverRev < seen) {
        // The server has seen fewer changes than this device already received from it: its database was restored from an older
        // backup (or rebuilt). Everything this device remembers about "what the server has" is void. Keep the data, forget the
        // bookkeeping, and reconcile from scratch: pull what the server has, then push whatever it is missing.
        // Two signals: the server's database file was replaced (its epoch changed -- reliable even if revisions have since grown
        // back past our cursor), or its revision is lower than one we have already seen.
        await this.local.resetSyncState();
        if (page.epoch) await this.local.noteEpoch(page.epoch);
        out.message = "The server's data had been restored from an older backup; this device re-sent what the server was missing.";
        cursor = 0;
        continue;
      }
      if (page.epoch && !knownEpoch) await this.local.noteEpoch(page.epoch);
      if (page.records.length) {
        const plan = await this.plan(page.records, forceServer);
        await this.local.commitPull(plan, page.rev);
        out.pulled += plan.adopt.length;
        out.conflicts += plan.conflicts.length;
        out.held += plan.hold.length;
        if (plan.adopt.length) out.changedLocal = true;
      } else if (page.rev !== cursor) {
        await this.local.commitPull({ adopt: [], keepLocal: [], conflicts: [], hold: [], releaseHeld: [] }, page.rev);
      }
      await this.local.noteServerRev(page.serverRev);
      cursor = page.rev;
      if (!page.more) break;
    }
  }

  private async nameIndex(table: SyncTable) {
    let idx = this.names.get(table);
    if (!idx) { idx = await this.local.nameIndex(table); this.names.set(table, idx); }
    return idx;
  }

  /** Decide, per incoming record, whether to adopt it, keep our newer local edit, hold it as a duplicate, or log a conflict. */
  private async plan(remote: RemoteRecord[], forceServer: boolean): Promise<PullPlan> {
    const views = await this.local.getMany(remote.map((r) => ({ table: r.table, id: r.id })));
    const plan: PullPlan = { adopt: [], keepLocal: [], conflicts: [], hold: [], releaseHeld: [] };
    const adopt = (r: RemoteRecord) => plan.adopt.push({ table: r.table, id: r.id, rev: r.rev, deleted: r.deleted, record: r.record });
    for (const r of remote) {
      const k = key(r.table, r.id);
      const v = views.get(k);
      const local = v?.record;
      const st = v?.state;
      if (forceServer) { adopt(r); continue; }

      // Our own push echoing back, or a delete we already know about: nothing to do.
      if (!r.deleted && local && !v.dirty && st?.rev === r.rev) continue;
      if (r.deleted && !local && st && !st.held && st.rev === r.rev && !v.dirtyDelete) continue;

      if (r.deleted) {
        if (st?.held) plan.releaseHeld.push(k);                  // the held duplicate was deleted on the server meanwhile
        if (!local || !v.dirty) { adopt(r); continue; }          // nothing here to lose, or an unedited copy: apply the delete
        // Edited here, deleted there: newer wins; the loser is logged either way.
        const localNewer = local.updatedAt > r.record.updatedAt;
        plan.conflicts.push({ table: r.table, id: r.id, at: this.now(), kept: localNewer ? 'local' : 'server', local, server: r.record });
        if (localNewer) plan.keepLocal.push({ table: r.table, id: r.id, rev: r.rev }); else adopt(r);
        continue;
      }

      // ---- the server's copy is live ----
      if (!local) {
        if (v?.dirtyDelete) {
          // Deleted here, but the server still has it. If the server's copy is what we last saw, nothing changed there: the
          // delete simply stands. If it was edited since, our delete is the newer decision (we cannot know when we made it
          // better than "now"), and the edit is kept in the conflict log so it can be restored.
          if (st && contentHash(r.record) !== st.hash) {
            plan.conflicts.push({ table: r.table, id: r.id, at: this.now(), kept: 'local', local: null, server: r.record });
          }
          plan.keepLocal.push({ table: r.table, id: r.id, rev: r.rev });
          continue;
        }
        // New to this device. Same name as a DIFFERENT local record? Hold it for review instead of creating a twin.
        if ((NAMED_TABLES as readonly string[]).includes(r.table)) {
          const idx = await this.nameIndex(r.table);
          const name = normName(r.record.name);
          const other = name ? idx.get(name) : undefined;
          if (other && other !== r.id) {
            plan.hold.push({ key: k, table: r.table as 'ingredients' | 'recipes', cloudId: r.id, localId: other, rev: r.rev, cloud: r.record, at: this.now() });
            continue;
          }
          if (name && !idx.has(name)) idx.set(name, r.id);
        }
        if (st?.held) plan.releaseHeld.push(k);
        adopt(r);
        continue;
      }
      if (!v.dirty || contentHash(r.record) === contentHash(local)) { adopt(r); continue; } // unedited here, or same content
      const localNewer = local.updatedAt > r.record.updatedAt; // ties -> server
      plan.conflicts.push({ table: r.table, id: r.id, at: this.now(), kept: localNewer ? 'local' : 'server', local, server: r.record });
      if (localNewer) plan.keepLocal.push({ table: r.table, id: r.id, rev: r.rev }); else adopt(r);
    }
    return plan;
  }

  /** Returns true when at least one conflict was settled in favour of the local copy (so a re-push is needed). */
  private async pushAll(changes: PushChange[], out: SyncOutcome): Promise<boolean> {
    let needRepush = false;
    for (let i = 0; i < changes.length; i += this.pushBatch) {
      const batch = changes.slice(i, i + this.pushBatch);
      const sent = new Map(batch.map((c) => [key(c.table, c.id), c]));
      const { results, serverRev } = await this.api.push(batch);
      await this.local.noteServerRev(serverRev);
      const ok: { table: SyncTable; id: string; rev: number; record: WireRec }[] = [];
      const conflictRemote: RemoteRecord[] = [];
      for (const r of results) {
        const c = sent.get(key(r.table, r.id));
        if (!c) continue;
        if (r.status === 'accepted' || r.status === 'unchanged') {
          ok.push({ table: c.table, id: c.id, rev: r.rev, record: c.record });
          if (r.status === 'accepted') out.pushed++;
        } else if (r.status === 'conflict') {
          conflictRemote.push({ table: c.table, id: c.id, rev: r.rev, deleted: !!r.serverRecord.deletedAt, record: r.serverRecord });
        } else if (r.status === 'rejected') {
          out.rejected.push(`${r.table}/${r.id}: ${r.reason}`);
        }
      }
      if (ok.length) await this.local.markPushed(ok);
      if (conflictRemote.length) {
        const plan = await this.plan(conflictRemote, false);
        await this.local.commitPull(plan, null);
        out.conflicts += plan.conflicts.length;
        out.held += plan.hold.length;
        if (plan.adopt.length) { out.changedLocal = true; out.pulled += plan.adopt.length; }
        if (plan.keepLocal.length) needRepush = true;
      }
    }
    return needRepush;
  }
}

function toPush(d: DirtyChange | PushChange): PushChange {
  return { table: d.table, id: d.id, record: d.record, baseRev: d.baseRev };
}

/** For stores: build a tombstone change for a record that has disappeared locally. */
export function deletionChange(table: SyncTable, id: string, rev: number, at: string): DirtyChange {
  return { table, id, record: tombstone(id, at), baseRev: rev, isDelete: true };
}

/** What a store remembers after a successful push. */
export function stateAfterPush(rev: number, record: WireRec): SyncStateEntry {
  return record.deletedAt ? { rev, hash: DELETED_HASH, deleted: true } : { rev, hash: contentHash(record) };
}
export function heldState(rev: number): SyncStateEntry { return { rev, hash: HELD_HASH, held: true }; }
