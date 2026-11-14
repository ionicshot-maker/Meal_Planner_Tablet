import { createContext, useContext } from 'react';
import type { ServerApi, ServerUser } from './api';
import type { HeldDuplicate } from './engine';
import type { LocalRec } from './records';
import type { ConflictRow } from './storeCore';
import type { DuplicateAction } from './duplicates';
import type { DuplicateCounts } from './duplicatePort';

export type SyncUiState =
  | 'checking' | 'unavailable' | 'signed-out' | 'needs-adopt' | 'needs-delete-confirm'
  | 'idle' | 'syncing' | 'offline' | 'read-only' | 'error';

export interface HeldItem { held: HeldDuplicate; local: LocalRec | undefined }

export interface SyncCtx {
  state: SyncUiState;
  user: ServerUser | null;
  needsSetup: boolean;
  lastSyncAt: string | null;
  /** The last thing worth telling the person (an error, or a note such as "restored from an older backup"). */
  message: string | null;
  conflictCount: number;
  heldCount: number;
  /** Set while deletions are being held back for confirmation: how many per table. */
  pendingDeletes: Record<string, number> | null;
  /** Changes from another device were applied behind the open page; `refreshView` re-reads what is on screen. */
  staleView: boolean;
  refreshView: () => void;
  /** Changes every time the visible pages should re-read their data (use as a React `key`). */
  viewKey: number;
  signIn: (username: string, password: string) => Promise<void>;
  createFirstAccount: (username: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Saves a file copy of this device's data (if it has any), then replaces it with the household's. */
  adoptServerData: () => Promise<void>;
  /** Owner, never-synced device: make the server match THIS device's data (the server backs up first; nothing here changes). */
  makeServerMatchThisDevice: () => Promise<void>;
  /** Send the held-back deletions to everyone. */
  confirmDeletes: () => Promise<void>;
  /** Cancel the held-back deletions: bring those items back from the server. */
  putDeletedBack: () => Promise<void>;
  /** The server API, for the account-management screen. */
  server: ServerApi;
  listConflicts: (limit?: number) => Promise<ConflictRow[]>;
  dismissConflict: (id: number) => Promise<void>;
  clearAllConflicts: () => Promise<void>;
  /** Saves the version that LOST a conflict back as a fresh edit, so it syncs and wins. */
  restoreConflictVersion: (id: number) => Promise<void>;
  listHeldDuplicates: () => Promise<HeldItem[]>;
  resolveDuplicate: (key: string, action: DuplicateAction) => Promise<DuplicateCounts>;
}

export const SyncContext = createContext<SyncCtx | null>(null);

export function useSync(): SyncCtx {
  const c = useContext(SyncContext);
  if (!c) throw new Error('useSync must be used within SyncProvider');
  return c;
}

/** The signed-in person, in the same `{ session, user, loading }` shape the old Supabase hook had. */
export function useAuth() {
  const { user, state } = useSync();
  return { session: user ? { user } : null, user, loading: state === 'checking' };
}

/** False only for a signed-in read-only account. With no server (or signed out) the app is a plain local app: everything is editable. */
export function useCanEdit(): boolean {
  const { user } = useSync();
  return !user || user.role !== 'readonly';
}

