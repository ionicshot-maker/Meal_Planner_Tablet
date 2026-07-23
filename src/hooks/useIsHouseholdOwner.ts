import { useEffect, useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { useSupabaseAuth } from './useSupabaseAuth'
import { getMyHouseholds } from '@/db/auth'
import { isSupabaseConfigured } from '@/db/supabase'

// Gates Dev Tools (see DevToolsPage) — true only when the signed-in user's
// role in the household currently active on this device (settings.householdSyncCode)
// is 'owner'. Deliberately checks the ACTIVE household specifically, not "owner
// of any household this account belongs to" — a contributor/readonly member of
// the household actually in use here shouldn't get Dev Tools just because they
// happen to own some other, unrelated household elsewhere.
//
// No Cloud Sync configured, not signed in, or no membership in the active
// household at all (including single-device households that never set up
// Account/Cloud Sync) all resolve to false — there is deliberately no other
// path to true (no local PIN, no device flag). See MealPlannerApp_Reference.md
// for the reasoning.
export function useIsHouseholdOwner(): { isOwner: boolean; loading: boolean } {
  const { settings } = useSettings()
  const { session, loading: authLoading } = useSupabaseAuth(settings.supabaseUrl, settings.supabaseAnonKey)
  const [isOwner, setIsOwner] = useState(false)
  const [checking, setChecking] = useState(true)
  const userId = session?.user?.id ?? null

  useEffect(() => {
    let cancelled = false

    if (authLoading) return // still resolving the session itself — stay in "checking"

    if (!userId || !isSupabaseConfigured(settings) || !settings.householdSyncCode) {
      setIsOwner(false)
      setChecking(false)
      return
    }

    setChecking(true)
    getMyHouseholds(settings.supabaseUrl, settings.supabaseAnonKey).then(households => {
      if (cancelled) return
      const active = households.find(h => h.code === settings.householdSyncCode)
      setIsOwner(active?.role === 'owner')
      setChecking(false)
    })

    return () => { cancelled = true }
  }, [authLoading, userId, settings.supabaseUrl, settings.supabaseAnonKey, settings.householdSyncCode])

  return { isOwner, loading: authLoading || checking }
}
