import { useAuth } from './useAuth'

// Gates Dev Tools (see DevToolsPage). True only for a signed-in account whose role is "owner" on this household's server.
// There is nothing to match any more (the old per-household code lookup is gone): the server holds one household, and the
// signed-in account's role is exactly what it says it is. Deliberately fails closed: no server, not signed in, or any other role
// all resolve to false — there is no local PIN and no device flag that can turn this on.
export function useIsHouseholdOwner(): { isOwner: boolean; loading: boolean } {
  const { user, loading } = useAuth()
  return { isOwner: user?.role === 'owner', loading }
}
