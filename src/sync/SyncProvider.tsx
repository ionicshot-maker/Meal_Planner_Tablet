/**
 * Background sync for the app. Everything here is optional and additive: when no Meal Planner server sits behind this origin
 * (a plain `vite dev`, or the server being down) the app behaves exactly as it always did, entirely on this device.
 * The context and hooks (`useSync`, `useAuth`, `useCanEdit`) live in syncContext.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../db/settings';
import { getDB } from '../db/schema';
import { useSettings } from '../context/SettingsContext';
import { ServerApi, type ServerUser } from './api';
import { SyncEngine, type SyncOutcome } from './engine';
import { createSyncStore, type IdbBacking } from './idbBacking';
import { onLocalChange } from './changeSignal';
import { fromWire, type LocalRec, type SyncTable } from './records';
import type { StoreCore } from './storeCore';
import { resolveHeldDuplicate } from './duplicates';
import { idbResolvePort } from './duplicatePort';
import { SyncContext, type SyncCtx, type SyncUiState } from './syncContext';
import { downloadSafetyBackup } from './safetyBackup';

const POLL_MS = 60_000;
const DEBOUNCE_MS = 3_000;
const STARTUP_DELAY_MS = 700; // let a freshly launched/resumed home-screen web app's network stack come up before the first request
const LAST_SYNC_KEY = 'mp_last_sync_at';

const readLast = () => { try { return localStorage.getItem(LAST_SYNC_KEY); } catch { return null; } };
const writeLast = (v: string) => { try { localStorage.setItem(LAST_SYNC_KEY, v); } catch { /* ignore */ } };

interface Core { api: ServerApi; engine: SyncEngine; store: StoreCore; backing: IdbBacking }

export function SyncProvider({ children }: { children: ReactNode }) {
  const { reloadSettings, settings } = useSettings();
  const core = useRef<Core | null>(null);
  const [ready, setReady] = useState(false);

  const [state, setState] = useState<SyncUiState>('checking');
  const [user, setUser] = useState<ServerUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(readLast);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [heldCount, setHeldCount] = useState(0);
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, number> | null>(null);
  const [staleView, setStaleView] = useState(false);
  const [viewKey, setViewKey] = useState(0);

  const reloadSettingsRef = useRef(reloadSettings);
  reloadSettingsRef.current = reloadSettings;
  const starterSeededRef = useRef(settings.starterLibrarySeeded);
  starterSeededRef.current = settings.starterLibrarySeeded;
  const running = useRef(false);
  const again = useRef(false);
  const signedIn = useRef(false);
  const adoptPending = useRef(false);
  const confirmNext = useRef(false);

  // One engine for the life of the app. (The device id lives in IndexedDB, so it is read asynchronously.)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { core: store, backing } = createSyncStore(DEFAULT_SETTINGS as unknown as LocalRec);
      const api = new ServerApi(await backing.deviceId());
      if (cancelled) return;
      core.current = { api, store, backing, engine: new SyncEngine(store, api) };
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshView = useCallback(() => { setStaleView(false); setViewKey((k) => k + 1); }, []);

  const apply = useCallback(async (o: SyncOutcome, opts: { autoRefresh?: boolean } = {}) => {
    const c = core.current!;
    setConflictCount(await c.store.conflictCount());
    setHeldCount((await c.store.listHeld()).length);
    setPendingDeletes(o.status === 'needs-delete-confirm' ? (o.pendingDeletes ?? null) : null);
    if (o.status === 'ok') {
      const at = new Date().toISOString();
      setState('idle'); setLastSyncAt(at); writeLast(at);
      setMessage(o.rejected.length ? `${o.rejected.length} change(s) were not accepted by the server (for example ${o.rejected[0]}).` : (o.message ?? null));
    } else if (o.status === 'needs-adopt') { adoptPending.current = true; setState('needs-adopt'); setMessage(o.message ?? null); }
    else if (o.status === 'needs-delete-confirm') { setState('needs-delete-confirm'); setMessage(o.message ?? null); }
    else if (o.status === 'signed-out') { signedIn.current = false; setUser(null); setState('signed-out'); setMessage(null); }
    else if (o.status === 'offline') { setState('offline'); setMessage(o.message ?? null); }
    else if (o.status === 'read-only') { setState('read-only'); setMessage(o.message ?? null); }
    else { setState('error'); setMessage(o.message ?? 'Sync failed.'); }
    if (o.changedLocal) {
      await reloadSettingsRef.current();
      if (opts.autoRefresh) refreshView(); else setStaleView(true);
    }
  }, [refreshView]);

  const runSync = useCallback(async () => {
    if (!core.current || !signedIn.current || adoptPending.current) return;
    if (running.current) { again.current = true; return; }
    running.current = true;
    setState('syncing');
    const confirmDeletes = confirmNext.current;
    confirmNext.current = false;
    try {
      await apply(await core.current.engine.syncOnce({ confirmDeletes }));
    } finally {
      running.current = false;
      if (again.current) { again.current = false; void runSync(); }
    }
  }, [apply]);

  const refreshAvailability = useCallback(async () => {
    if (!core.current) return;
    const a = await core.current.api.availability();
    setNeedsSetup(!!a.needsSetup);
    if (a.state === 'unavailable') { signedIn.current = false; setUser(null); setState('unavailable'); return; }
    if (a.state === 'signed-out') { signedIn.current = false; setUser(null); setState('signed-out'); return; }
    signedIn.current = true;
    setUser(a.user ?? null); // refreshed every cycle, so a role change made by an owner shows up within a minute
    await runSync();
  }, [runSync]);

  // Not the instant the app mounts: a home-screen web app that was just launched/resumed can have a network stack that is not
  // ready yet, and its first requests then fail at once. A short pause (plus the retries in ServerApi) avoids a false "offline".
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => void refreshAvailability(), STARTUP_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [ready, refreshAvailability]);

  // Triggers: periodic, back online, tab visible again, and a few seconds after the local data last changed.
  useEffect(() => {
    if (!ready) return;
    let resumeTimer: number | undefined;
    let changeTimer: number | undefined;
    const tick = () => { if (document.visibilityState === 'visible') void refreshAvailability(); };
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => void refreshAvailability(), STARTUP_DELAY_MS);
    };
    const online = () => void refreshAvailability();
    const timer = window.setInterval(tick, POLL_MS);
    const offChange = onLocalChange(() => {
      window.clearTimeout(changeTimer);
      changeTimer = window.setTimeout(() => void runSync(), DEBOUNCE_MS);
    });
    window.addEventListener('online', online);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.clearInterval(timer); window.clearTimeout(resumeTimer); window.clearTimeout(changeTimer); offChange();
      window.removeEventListener('online', online); window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [ready, refreshAvailability, runSync]);

  const value = useMemo<SyncCtx>(() => {
    // `server` is only read once the app is up; before that the account screen shows "checking".
    const c = () => core.current!;
    return {
      state, user, needsSetup, lastSyncAt, message, conflictCount, heldCount, pendingDeletes, staleView, refreshView, viewKey,
      signIn: async (username, password) => { await c().api.login(username, password); await refreshAvailability(); },
      createFirstAccount: async (username, displayName, password) => { await c().api.setup(username, displayName, password); await refreshAvailability(); },
      signOut: async () => { await c().api.logout(); signedIn.current = false; setUser(null); setState('signed-out'); setPendingDeletes(null); },
      syncNow: async () => { await refreshAvailability(); },
      adoptServerData: async () => {
        setState('syncing');
        // Safety net first: a file copy of this device's data, before anything is replaced.
        await downloadSafetyBackup('meal-planner-before-joining-household', starterSeededRef.current);
        running.current = true;
        try {
          const outcome = await c().engine.adoptServerData();
          // Only let background sync resume once this actually worked; otherwise the next debounced cycle would re-discover
          // "needs adoption" and silently replace the error message on screen.
          if (outcome.status === 'ok') adoptPending.current = false;
          await apply(outcome, { autoRefresh: true });
        } finally { running.current = false; }
      },
      makeServerMatchThisDevice: async () => {
        setState('syncing');
        await downloadSafetyBackup('meal-planner-before-replacing-server-data', starterSeededRef.current);
        running.current = true;
        try {
          const outcome = await c().engine.makeServerMatchThisDevice();
          if (outcome.status === 'ok') adoptPending.current = false;
          await apply(outcome, { autoRefresh: true });
        } finally { running.current = false; }
      },
      confirmDeletes: async () => { confirmNext.current = true; await runSync(); },
      putDeletedBack: async () => {
        running.current = true;
        try { await apply(await c().engine.restoreDeletedFromServer(), { autoRefresh: true }); } finally { running.current = false; }
      },
      server: undefined as unknown as ServerApi,
      listConflicts: (limit) => c().store.listConflicts(limit),
      dismissConflict: async (id) => { await c().backing.dismissConflict(id); setConflictCount(await c().store.conflictCount()); },
      clearAllConflicts: async () => { await c().backing.clearAllConflicts(); setConflictCount(0); },
      restoreConflictVersion: async (id) => {
        const row = (await c().store.listConflicts(1000)).find((r) => r.id === id);
        if (!row) return;
        const losing = row.kept === 'local' ? row.server : row.local;
        if (losing) await restoreRecord(row.table, losing as LocalRec & { id: string });
        await c().backing.dismissConflict(id);
        setConflictCount(await c().store.conflictCount());
        refreshView();
      },
      listHeldDuplicates: async () => {
        const held = await c().store.listHeld();
        const db = await getDB();
        return Promise.all(held.map(async (h) => ({ held: h, local: (await db.get(h.table, h.localId)) as unknown as LocalRec | undefined })));
      },
      resolveDuplicate: async (key, action) => {
        const counts = await resolveHeldDuplicate(c().store, idbResolvePort, key, action);
        setHeldCount((await c().store.listHeld()).length);
        refreshView();
        return counts;
      },
    };
  }, [state, user, needsSetup, lastSyncAt, message, conflictCount, heldCount, pendingDeletes, staleView, viewKey, refreshView, refreshAvailability, runSync, apply]);

  // `server` is a stable object once ready; expose it without making every context consumer re-render when it is created.
  const withServer = useMemo(() => ({ ...value, server: (ready ? core.current!.api : undefined) as unknown as ServerApi }), [value, ready]);
  return <SyncContext.Provider value={withServer}>{children}</SyncContext.Provider>;
}

/** Writes a record back as a fresh edit (so it syncs and wins next time). A losing TOMBSTONE means "this was deleted": delete it. */
async function restoreRecord(table: SyncTable, wire: LocalRec & { id: string; updatedAt?: string; deletedAt?: string | null }) {
  if (table === 'settings') throw new Error("Settings can't be restored from the conflict list.");
  const db = await getDB();
  if (wire.deletedAt) { await db.delete(table as 'recipes', wire.id); return; }
  const local = fromWire(table, wire as never);
  local.updatedAt = new Date().toISOString();
  await db.put(table as 'recipes', local as never);
}
