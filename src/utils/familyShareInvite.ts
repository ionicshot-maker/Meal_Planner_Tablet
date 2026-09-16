// Structured Family Share invite encoding — carries the household code and
// the role the owner chose for this specific invite as separate fields
// inside one opaque token, rather than concatenating a role onto the code
// string itself (the same fragility already flagged for the unrelated
// `<code>:family` data-partition convention). The code itself never
// changes shape; only this separate, regenerate-any-time invite token
// carries a role.
export interface FamilyShareInvite {
  code: string
  role?: 'contributor' | 'readonly'
}

const INVITE_VERSION = 1

export function encodeFamilyShareInvite(code: string, role: 'contributor' | 'readonly'): string {
  const payload = { v: INVITE_VERSION, code, role }
  return btoa(encodeURIComponent(JSON.stringify(payload)))
}

// Tolerant by design: a real invite token decodes to its encoded role: a
// plain/bare code (no token ever generated, or a family member was just
// given the code directly) falls back to `{ code, role: undefined }` so
// the caller can pass that straight to joinHouseholdByCode() and let its
// own default ('contributor') apply — never throws, never returns null
// for non-empty input.
export function decodeFamilyShareInvite(token: string): FamilyShareInvite | null {
  const trimmed = token.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(atob(trimmed))) as { v?: unknown; code?: unknown; role?: unknown }
    if (parsed && typeof parsed.code === 'string' && parsed.code.trim()) {
      const role = parsed.role === 'readonly' || parsed.role === 'contributor' ? parsed.role : undefined
      return { code: parsed.code.trim(), role }
    }
  } catch {
    // Not a valid invite token — fall through and treat the raw input as a bare code.
  }

  return { code: trimmed, role: undefined }
}
