// The signed-in person and what they may do. The provider lives in src/sync/SyncProvider.tsx; this is the import path the rest of
// the UI uses. `useAuth()` keeps the `{ session, user, loading }` shape the old Supabase hook had, so call sites barely change.
export { useAuth, useCanEdit } from '@/sync/syncContext'
