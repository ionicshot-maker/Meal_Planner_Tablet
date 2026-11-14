/**
 * "Something was written to the local database." The app writes straight to IndexedDB from many places (the db modules, the
 * importers, the reset), so rather than remember to announce each write, `getDB()` (src/db/schema.ts) raises this after any write
 * the app makes. The sync provider listens and syncs a few seconds after the last one. The sync engine's own writes use an
 * unwrapped connection and never raise it.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function markLocalChange(): void {
  for (const l of listeners) { try { l(); } catch { /* a listener must never break a write */ } }
}

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Stores that hold sync bookkeeping, not household data: writing them is never a "local change". */
export const BOOKKEEPING_STORES: ReadonlySet<string> = new Set(['syncState', 'syncMeta', 'syncConflicts', 'heldDuplicates']);
/** Stores whose changes never leave the device (so changing them is not worth a sync). */
export const LOCAL_ONLY_STORES: ReadonlySet<string> = new Set(['mealPlanTemplates', 'macroLogs', 'processedReceipts']);

const WRITE_METHODS = new Set(['put', 'add', 'delete', 'clear']);

function touchesSyncedData(stores: unknown): boolean {
  const names = Array.isArray(stores) ? stores : [stores];
  return names.some((n) => typeof n === 'string' && !BOOKKEEPING_STORES.has(n) && !LOCAL_ONLY_STORES.has(n));
}

/** Wraps an idb database so any write to a synced store raises the change signal once it has completed. Reads pass straight through. */
export function withChangeSignal<T extends object>(db: T): T {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== 'function') return value;
      const fn = value as (...a: unknown[]) => unknown;
      if (typeof prop === 'string' && WRITE_METHODS.has(prop)) {
        return async (...args: unknown[]) => {
          const result = await fn.apply(target, args);
          if (touchesSyncedData(args[0])) markLocalChange();
          return result;
        };
      }
      if (prop === 'transaction') {
        return (...args: unknown[]) => {
          const tx = fn.apply(target, args) as { done: Promise<unknown> };
          if (args[1] === 'readwrite' && touchesSyncedData(args[0])) tx.done.then(markLocalChange, () => { /* aborted: nothing changed */ });
          return tx;
        };
      }
      return fn.bind(target);
    },
  });
}
