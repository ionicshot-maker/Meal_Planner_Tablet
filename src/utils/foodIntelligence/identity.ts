// Meal Planner-specific glue (NOT part of the vendored Food Intelligence client): supplies the signed-in user's
// Supabase access token and active household id to the optional Food Intelligence calls.
//
// Food Intelligence never owns identity: it verifies the token, and asks Supabase - as this user - whether they
// belong to the household id sent in `X-Household-Id`. Not signed in / Supabase not configured => no identity, and
// the household-only Food Intelligence features simply stay unavailable (public catalog features still work).
import { loadSettings } from '@/db/settings'
import { getSupabaseClient } from '@/db/supabase'
import { getMyHouseholds } from '@/db/auth'
import type { GuardDeps } from './resilient.ts'

const HOUSEHOLD_TTL_MS = 5 * 60_000
let cachedHousehold: { userId: string; householdId: string | undefined; at: number } | null = null

async function session() {
  try {
    const settings = await loadSettings()
    if (!settings.supabaseUrl?.trim() || !settings.supabaseAnonKey?.trim()) return null
    const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
    if (!client) return null
    const { data } = await client.auth.getSession()
    return data.session ? { token: data.session.access_token, userId: data.session.user.id, settings } : null
  } catch {
    return null
  }
}

export async function currentIdentity(): Promise<{ token?: string; householdId?: string; signedIn: boolean }> {
  const s = await session()
  if (!s) return { signedIn: false }
  const fresh = cachedHousehold && cachedHousehold.userId === s.userId && Date.now() - cachedHousehold.at < HOUSEHOLD_TTL_MS
  if (!fresh) {
    let householdId: string | undefined
    try {
      householdId = (await getMyHouseholds(s.settings.supabaseUrl, s.settings.supabaseAnonKey))[0]?.householdId
    } catch {
      householdId = undefined
    }
    cachedHousehold = { userId: s.userId, householdId, at: Date.now() }
  }
  return { token: s.token, householdId: cachedHousehold?.householdId, signedIn: true }
}

/** Deps for guarded()/submit helpers that need the user's identity (receipts, discovery). */
export function fiIdentityDeps(): GuardDeps {
  return {
    getToken: async () => (await currentIdentity()).token,
    householdId: async () => (await currentIdentity()).householdId,
  }
}
