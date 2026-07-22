import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'contributor' | 'readonly'

export interface HouseholdMembership {
  householdId: string
  code: string
  name: string | null
  role: MemberRole
}

export interface HouseholdMemberRow {
  userId: string
  displayName: string | null
  role: MemberRole
  joinedAt: string
}

export interface AuthResult {
  ok: boolean
  error?: string
  needsEmailConfirmation?: boolean
}

// ─── Sign up / sign in / sign out ──────────────────────────────────────────
// This is the real per-user login the household-code model never had —
// each person creates their own account through this, nothing here creates
// or pre-fills an account on anyone's behalf.

export async function signUpWithPassword(url: string, key: string, email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { ok: false, error: error.message }
  // If email confirmation is required on this project, signUp succeeds but
  // returns no session yet — the account exists but can't sign in until the
  // confirmation link is clicked.
  return { ok: true, needsEmailConfirmation: !data.session }
}

export async function signInWithPassword(url: string, key: string, email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function signOut(url: string, key: string): Promise<void> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getCurrentSession(url: string, key: string): Promise<Session | null> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Returns an unsubscribe function, matching the shape React effects expect.
export function onAuthStateChange(url: string, key: string, callback: (session: Session | null) => void): () => void {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

// ─── Households ─────────────────────────────────────────────────────────────

export async function createHousehold(url: string, key: string, code: string, name: string, displayName: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { error } = await supabase.rpc('create_household', { p_code: code, p_name: name, p_display_name: displayName })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function joinHouseholdByCode(url: string, key: string, code: string, displayName: string): Promise<{ ok: boolean; error?: string; role?: MemberRole }> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('join_household_by_code', { p_code: code, p_display_name: displayName })
  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  // Column names are out_household_id/out_role, not household_id/role — the
  // RPC's RETURNS TABLE deliberately avoids reusing the real column names
  // (see AUTH_MIGRATION_FIX3_SQL) to sidestep a PL/pgSQL ambiguous-reference
  // bug where the output variable collided with the table column inside the
  // function body's ON CONFLICT clause.
  return { ok: true, role: row?.out_role as MemberRole | undefined }
}

export async function getMyHouseholds(url: string, key: string): Promise<HouseholdMembership[]> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return []
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, households(id, code, name)')
    .eq('user_id', userId)
  if (error || !data) return []

  return data
    .map((row: Record<string, unknown>) => {
      const h = row.households as { id: string; code: string; name: string | null } | null
      if (!h) return null
      return { householdId: h.id, code: h.code, name: h.name, role: row.role as MemberRole }
    })
    .filter((m): m is HouseholdMembership => m !== null)
}

export async function getHouseholdMembers(url: string, key: string, householdId: string): Promise<HouseholdMemberRow[]> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return []
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, display_name, role, joined_at')
    .eq('household_id', householdId)
    .order('joined_at')
  if (error || !data) return []
  return data.map(r => ({
    userId: r.user_id as string,
    displayName: r.display_name as string | null,
    role: r.role as MemberRole,
    joinedAt: r.joined_at as string,
  }))
}

export async function updateMemberRole(url: string, key: string, householdId: string, userId: string, role: MemberRole): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { error } = await supabase
    .from('household_members')
    .update({ role })
    .eq('household_id', householdId)
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeMember(url: string, key: string, householdId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient(url, key)
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
