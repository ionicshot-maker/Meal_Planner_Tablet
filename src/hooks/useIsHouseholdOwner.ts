import { useEffect, useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { useSupabaseAuth } from './useSupabaseAuth'
import { getMyHouseholds } from '@/db/auth'
import { isSupabaseConfigured } from '@/db/supabase'

// Gates Dev Tools (see DevToolsPage). Tries to resolve role within the
// specific household matching settings.householdSyncCode (case/whitespace-
// insensitive — see bug note below), and falls back to "owner of any
// household this signed-in account belongs to" when that doesn't confidently
// resolve. No Cloud Sync configured, not signed in, or no owned membership
// anywhere all resolve to false — no other path to true (no local PIN, no
// device flag). See MealPlannerApp_Reference.md for the full reasoning and
// the 2026-07-24 bug this fallback was added for.
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

      if (active) {
        setIsOwner(active.role === 'owner')
      } else {
        // Still no confident match (code unset, stale, or a deeper mismatch
        // than casing) — don't silently lock out a real owner over a local
        // caching quirk. Fall back to "owner of any household this account
        // belongs to," which is unambiguous for the common single-household
        // case and reasonably permissive for the rare multi-household one —
        // Dev Tools has no cross-household data access to begin with.
        setIsOwner(households.some(h => h.role === 'owner'))
      }
      setChecking(false)
    })

    return () => { cancelled = true }
  }, [authLoading, userId, settings.supabaseUrl, settings.supabaseAnonKey, settings.householdSyncCode])

  return { isOwner, loading: authLoading || checking }
}
