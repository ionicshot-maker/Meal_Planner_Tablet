import { useEffect, useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { useSupabaseAuth } from './useSupabaseAuth'
import { getMyHouseholds } from '@/db/auth'
import { isSupabaseConfigured } from '@/db/supabase'

// Gates Dev Tools (see DevToolsPage). Resolves role within the specific
// household matching settings.householdSyncCode (case/whitespace-insensitive
// — see MealPlannerApp_Reference.md for the 2026-07-24 casing bug this
// fixed). Deliberately fails closed: if that match doesn't resolve
// confidently for any reason (code unset, stale, no match in the list), this
// returns false rather than falling back to "owner of any household this
// account belongs to" — a contributor of the active household who happens to
// separately own some unrelated household must never get Dev Tools access to
// the one actually in use. An earlier version of this hook had that
// fallback; it was removed after review concluded it was only safe by
// accident (today's single Dev Tools entry happens to show nothing
// household-specific) and not by design — a future tool added here wouldn't
// be prompted to reconsider it. No Cloud Sync configured, not signed in, or
// no confidently-resolved owner membership all resolve to false — no other
// path to true (no local PIN, no device flag).
export function useIsHouseholdOwner(): { isOwner: boolean; loading: boolean } {
  const { settings } = useSettings()
  const { session, loading: authLoading } = useSupabaseAuth(settings.supabaseUrl, settings.supabaseAnonKey)
  const [isOwner, setIsOwner] = useState(false)
  const [checking, setChecking] = useState(true)
  const userId = session?.user?.id ?? null

  useEffect(() => {
    let cancelled = false

    if (authLoading) return // still resolving the session itself — stay in "checking"

    if (!userId || !isSupabaseConfigured(settings)) {
      setIsOwner(false)
      setChecking(false)
      return
    }

    setChecking(true)
    getMyHouseholds(settings.supabaseUrl, settings.supabaseAnonKey).then(households => {
      if (cancelled) return

      // Case/whitespace-insensitive match — found live (2026-07-24) that a
      // real household's households.code ("Angelo-Family-2026") and the
      // household_code actually stamped on that same household's synced data
      // rows ("angelo-family-2026" / "Angelo-family-2026") disagree on
      // casing. settings.householdSyncCode is set from whichever of these a
      // given device last saw, so a case-sensitive match silently failed for
      // a genuine owner. Normalizing here doesn't require a data migration.
      const norm = (s: string) => s.trim().toLowerCase()
      const activeCode = settings.householdSyncCode ? norm(settings.householdSyncCode) : null
      const active = activeCode ? households.find(h => norm(h.code) === activeCode) : undefined

      // No confident match (code unset, stale, or a deeper mismatch than
      // casing) fails closed — false, not "owner of any household this
      // account belongs to." An unresolvable match should surface as a
      // missing feature / support question, never a silently-wrong grant.
      setIsOwner(active ? active.role === 'owner' : false)
      setChecking(false)
    })

    return () => { cancelled = true }
  }, [authLoading, userId, settings.supabaseUrl, settings.supabaseAnonKey, settings.householdSyncCode])

  return { isOwner, loading: authLoading || checking }
}
