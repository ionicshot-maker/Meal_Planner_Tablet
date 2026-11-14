/**
 * Resolving a held duplicate (an incoming ingredient/recipe whose name matches a different record already on this device).
 * Same three choices, and the same reference-repointing, the app has always had -- only the cloud-side step changed:
 * there is no cloud row to rewrite any more, so "keep mine" simply retires the other copy by recording a pending deletion for it
 * (the next sync sends that as a tombstone).
 *
 * The logic is here, against a small `ResolvePort`, so it can be tested without a browser; duplicatePort.ts plugs in IndexedDB and
 * the existing reference-repointing (which must run inside one IndexedDB transaction with the record writes).
 */
import type { StoreCore } from './storeCore';
import { contentHash, fromWire, type LocalRec } from './records';

export type DuplicateAction = 'keep-local' | 'keep-cloud' | 'keep-both';
export type NamedTable = 'ingredients' | 'recipes';

export interface ResolvePort<Counts> {
  get(table: NamedTable, id: string): Promise<LocalRec | undefined>;
  put(table: NamedTable, record: LocalRec): Promise<void>;
  /** Keep the incoming copy: in ONE transaction, save it, repoint everything that referenced `local` to it, delete `local`. */
  keepIncoming(table: NamedTable, local: LocalRec, incoming: LocalRec): Promise<Counts>;
  /** Keep the local copy: repoint anything that referenced the incoming copy's id to the local one (a defensive no-op today). */
  repointToLocal(table: NamedTable, incoming: LocalRec, local: LocalRec): Promise<Counts>;
  none(): Counts;
}

/** Settles one held duplicate. Returns whatever reference counts the port reports (for the "N recipes updated" message). */
export async function resolveHeldDuplicate<Counts>(
  store: StoreCore, port: ResolvePort<Counts>, key: string, action: DuplicateAction,
): Promise<Counts> {
  const held = await store.getHeld(key);
  if (!held) throw new Error('That duplicate has already been settled.');
  const incoming = fromWire(held.table, held.cloud);
  const settled = { rev: held.rev, hash: contentHash(held.cloud) }; // from now on it is an ordinary, in-sync record
  const local = await port.get(held.table, held.localId);

  // The local copy is gone (deleted since it was held): there is nothing left to collide with, so just take the incoming one.
  if (!local) {
    await port.put(held.table, incoming);
    await store.settleHeld(key, settled);
    return port.none();
  }

  if (action === 'keep-both') {
    // Nothing is discarded, so no id becomes invalid and nothing needs repointing.
    await port.put(held.table, incoming);
    await store.settleHeld(key, settled);
    return port.none();
  }
  if (action === 'keep-cloud') {
    const counts = await port.keepIncoming(held.table, local, incoming);
    await store.settleHeld(key, settled); // the local copy's disappearance is detected and sent by the next sync
    return counts;
  }
  // keep-local
  const counts = await port.repointToLocal(held.table, incoming, local);
  // Not held, not deleted, and no local record under the incoming id: the next sync reads that as a deletion of the server's copy.
  await store.settleHeld(key, { rev: held.rev, hash: 'retired' });
  return counts;
}
