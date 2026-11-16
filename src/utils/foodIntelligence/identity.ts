// Meal Planner-specific glue (NOT part of the vendored Food Intelligence client): supplies the signed-in user's
// identity to the optional Food Intelligence calls.
//
// SELF-HOSTED BUILD: this app no longer uses Supabase. Sessions are opaque tokens issued by the Meal Planner server
// (src/sync/api.ts), which the Food Intelligence API cannot verify (it verifies Cloudflare Access and Supabase-issued JWTs).
// Until a server-side identity bridge exists (e.g. the Meal Planner server vouching for a household to Food Intelligence),
// this deliberately reports "no identity" and sends NO token. Consequences, all fail-closed:
//   - public catalog features (barcode lookup, grocery enrichment) keep working;
//   - household-only features (receipt price submission, source discovery) stay unavailable.
// Do not forward the Meal Planner session token to Food Intelligence: it is a credential for a different service.
import type { GuardDeps } from './resilient.ts'

export async function currentIdentity(): Promise<{ token?: string; householdId?: string; signedIn: boolean }> {
  return { signedIn: false }
}

/** Deps for guarded()/submit helpers that need the user's identity (receipts, discovery). */
export function fiIdentityDeps(): GuardDeps {
  return {
    getToken: async () => undefined,
    householdId: async () => undefined,
  }
}
