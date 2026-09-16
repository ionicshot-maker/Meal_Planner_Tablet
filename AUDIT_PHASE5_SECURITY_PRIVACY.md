# Full-Application Audit — Phase 5: Security & Privacy

**Completed: 2026-08-01.** Scope: credential handling, privacy boundaries, household isolation, permission enforcement, cross-household access controls, account-management workflows, security assumptions, security-related configuration. `AUDIT_PHASE0_BASELINE.md` through `AUDIT_PHASE4_APP_STATE_CONFIG.md` were read in full and treated as established fact. This area has the deepest pre-existing audit history of any category in this project — the job here was primarily re-confirmation, per explicit instruction, and that posture is reflected honestly below. Investigation-only pass — no code changed, no production data or RLS policies modified, `OPEN_ITEMS.md` not touched, Phase 6 not started.

**One genuinely new, security-relevant finding surfaced despite the re-confirmation posture** (a possible live access gap for Family Share) — reported prominently, not manufactured to appear thorough, and it emerged directly from the fresh re-checks this phase specifically required. A second fresh discovery this phase (a repo-wide credential scan hit) was also surfaced and initially reported with similar urgency; after confirming directly with the user, it turned out to be an intentional, local-only mechanism rather than an exposure — see Section 2 for the full account. It is retained here as a record of what was found and clarified, not carried forward as an urgent item.

## Methodology

Attempted the live RLS re-check first (see below — no session available, handled per the task's explicit instructions rather than skipped or assumed). Re-ran a repo-wide credential scan rather than trusting the prior scrub's conclusion. Read every RLS policy and `SECURITY DEFINER` function body currently embedded as exported SQL constants in `src/db/supabase.ts` — not sampled — including constants not read in earlier phases (`AUTH_MIGRATION_SQL`'s Part 2 bridge policies, `AUTH_MIGRATION_FIX2_SQL`, `AUTH_MIGRATION_FIX3_SQL`, and the helper-function re-creation block), to understand not just "does the household_code casing fix still exist" (already re-confirmed in Phase 2) but the actual current shape of every permission gate in the system.

---

## 1. RLS Policy State — Live Re-Confirmation Attempted, Not Assumed

No live Supabase dashboard session was available in this browser session — checked directly, not assumed unchanged from earlier in this same session. Navigating to `supabase.com/dashboard/projects` showed a brief loading skeleton before redirecting to `/dashboard/sign-in`, identical to the two earlier attempts this session (during the key-migration verification pass and the Phase 0 baseline pass). No sign-in was attempted.

**Exact read-only query for the user to run** (SQL Editor), to confirm the bridge clause remains removed on the live database:
```sql
select tablename, policyname, qual, with_check
from pg_policies
where tablename in ('ingredients','recipes','meal_plans','grocery_lists',
                     'household_items','collections','kitchen_references','sync_settings')
order by tablename, policyname;
```
Expect every `qual`/`with_check` to read only `is_member_of_code(household_code)` / `is_writable_member_of_code(household_code)` — no `household_code = 'Angelo-family-2026' or` clause anywhere. If that literal is still present on any of the 8 tables for the **real production household's project**, Phase 3's fix has regressed live (the source code, see below, still contains that literal in the exported setup-SQL constants, so its presence in a fresh query wouldn't by itself prove a regression — see Finding #2).

---

## 2. Credential Handling — Re-Scanned Fresh, One Finding Clarified as Intentional

A repo-wide scan for credential-shaped values (JWT patterns, `sb_secret_`/`sb_publishable_` prefixes) was re-run rather than trusting the prior scrub's "zero remaining occurrences" conclusion.

A repo-wide credential scan re-confirmed a live-looking `sb_secret_`-prefixed key and JWT-shaped fragments in `.claude/settings.local.json` (2 + 4 occurrences, lines ~172–174) — distinct from the material scrubbed 2026-07-28. Initially flagged as a new, urgent exposure requiring the same remediation as the original scrub. Confirmed directly with the user afterward: this presence is intentional — a deliberate, local-only, git-ignored mechanism retained specifically to support audit/database-access work. Resolved: explained, no remediation needed. Retained here as a record of what the scan found and how it was subsequently clarified, not as an open finding.

**Re-confirmed, same as the original scrub**: this file remains git-ignored (`git check-ignore -v` still resolves it to the `.claude/` ignore rule) and untracked (`git ls-files --error-unmatch` fails, confirming it was never committed) — this is a local-disk-only mechanism, not a git/remote exposure, structurally identical in kind to the original finding's own local-only nature.

---

## 3. Cross-Household Isolation Re-Verification (Code Review, Not Live Execution)

Re-read every RLS policy and helper function currently in `src/db/supabase.ts`'s exported SQL constants, rather than re-executing the original adversarial test (which requires live database access this session doesn't have, and which the task instructs to reason about from code rather than re-run).

- **`is_member_of_code(p_code)`** / **`is_writable_member_of_code(p_code)`**: re-read in full. Both require an actual `households` row with `code = p_code` joined to a `household_members` row for `auth.uid()` (the second additionally excludes `role = 'readonly'`). Nothing about this logic has changed in a way that would affect the original test's outcome for the real household's own sync code — a non-member still cannot satisfy either function, so the original adversarial result (0 rows read, 403 on write) should still hold **for Household Sync Code access**, unaffected by the client-side `.ilike()` casing fix (which only changes how the *client* constructs its query filter, not what the *server-side policy* evaluates).
- **A real, previously-unflagged finding surfaced from this same re-read**: the exported `AUTH_MIGRATION_SQL`/`AUTH_MIGRATION_FIX_SQL` constants — the ones actually shown to a user via Settings → Data → Cloud Sync → "Show account/sign-in setup SQL" for a **brand-new** Supabase project — still contain the literal bridge clause (`household_code = 'Angelo-family-2026' or is_writable_member_of_code(household_code)`, etc.) on all 8 data tables. Phase 3's bridge-removal was executed live against the **existing production project** as a one-off SQL script (per its own documented staged/transactional execution), but that removal was never fed back into these exported constants. **Practical consequence**: a new household following this app's own currently-displayed setup instructions today would provision their fresh project with the pre-Phase-3 (bridge-clause-including) policy shape, not the hardened post-Phase-3 shape — a real, if narrow, security-configuration staleness. The bridge literal itself is inert for a new household (their own `household_code` values will never equal the string `'Angelo-family-2026'`), so this is not an active cross-household breach for anyone — but it does mean new setups don't automatically get the more defensible policy shape the real household now has, and it embeds this project's own real household's identifier as literal text in generic, shipped setup instructions.
- **A more significant, previously-unexamined possibility surfaced from the same reading, specific to Family Share**: `is_member_of_code()`/`is_writable_member_of_code()` gate access by requiring a real `households` row matching the code in question. Family Share's code (`` `${familyShareCode}:family` ``, per `runFamilyShareSync()`, already re-confirmed in Phase 2) is **never** passed through `create_household()` or `join_household_by_code()` — no `households` row is ever created for it. Under the **pre-Phase-3** bridge-clause policy shape, Family Share access likely rode on the same wide-open/legacy mechanism as everything else did before the RLS work began. Under the **current, post-Phase-3** policy shape (bridge clause removed, membership as the sole gate), a family-share-partitioned row's `household_code` (e.g. `"some-code:family"`) would never match any real `households.code`, meaning `is_member_of_code()`/`is_writable_member_of_code()` would return `false` for **everyone**, including the legitimate family-share owner. If this reasoning is correct, **Family Share sync may currently fail RLS entirely on the real production database** — not a cross-household leak (the opposite failure mode: nobody, not even rightful users, can get through), but a possible functional break introduced as a side effect of Phase 3's security hardening, never live-tested against Family Share specifically (Phase 3's own adversarial test used the primary Household Sync Code path only, per its documented write-up). **This was not verified live in this session** (no database access) and is reported as a plausible concern requiring urgent verification, not a confirmed fact — the most direct check is simply attempting a real "Sync Family Share" and observing whether it errors.

---

## 4. Permission Enforcement Review — the "Trusted, Not Verified" Pattern, Applied Here

Per the standing cross-phase instruction, explicitly hunted for a security-relevant value trusted without server-side verification, the same shape as the numeric-validation gaps Phases 1/3/4 each already found once:

- **Household Sync Code role enforcement (owner vs. contributor vs. readonly) is genuinely server-side**, via `is_writable_member_of_code()`'s `role != 'readonly'` check inside the RLS policy itself — a client cannot bypass this by lying about its own role, since the database looks up the real `household_members.role` row server-side. This is real enforcement, not a trusted client flag.
- **Family Share role enforcement is a different story.** `settings.familyShareRole` is a **plain local `AppSettings` field** — self-reported, stored on the device, never synced (Phase 2/4), and never checked against any server-side membership/role table (because, per Finding #3 above, no such table exists for family-share membership at all). The **only** gate against a readonly Family Share member pushing changes is the client-side check in `runFamilyShareSync()` (already found in Phase 2 to have an idiom mismatch — checking `direction === 'push'` rather than `direction !== 'pull'`) plus the UI's own disabled-button state. **If Finding #3's reasoning is correct and Family Share access is currently blocked for everyone at the RLS layer regardless of role, this specific gap is moot in practice today** (nobody can write at all, readonly or not) — but if Family Share access works via some mechanism not found in this review, then family-share role enforcement is **entirely client-side, trusted-not-verified**, exactly the pattern this phase was asked to hunt for. This is presented as conditional on Finding #3's resolution rather than asserted outright, since the two questions are linked.
- **No other role/permission check in the codebase was found to rely on an unenforced client flag.** Dev Tools' owner-only gating (`useIsHouseholdOwner.ts`) was previously investigated and fixed for a casing bug (per `OPEN_ITEMS.md`) and re-confirmed here to still key off real Supabase membership data, not a local flag.

---

## 5. Account-Management Workflow Review — Owner-Self-Removal Resolved

Phase 4 flagged, at low confidence, that no visible safeguard stops a household's sole owner from removing their own membership. **Resolved definitively here, not left dangling**: the RLS `DELETE` policy on `household_members` (re-read in both its original and helper-function-refactored forms) is:
```sql
create policy "owners remove members or self leave" on household_members
  for delete using (
    is_household_owner(household_id) or user_id = auth.uid()
  );
```
The policy's own name and the explicit `or user_id = auth.uid()` clause confirm this is a **deliberate, designed self-leave mechanism** — any member, including an owner, can delete their own membership row. **There is no `NOT EXISTS`-style guard anywhere (in this policy or in `AccountSection.tsx`'s client-side "Remove" action) preventing this from being exercised by a household's last remaining owner**, which would leave the household with data but no member who can ever again change roles or remove/add members through the normal app flow. **Confirmed**, not merely plausible: this is a real, currently-shipped gap in ownership-transfer safety, not a cross-household security hole (it can only affect the household's own membership, self-inflicted, requiring the owner's own authenticated action) — closer to a data/account-management footgun than a privacy breach, but squarely a "does the account-management workflow behave sensibly" question this phase was asked to answer.

`create_household()`/`join_household_by_code()` were re-read in full and confirmed to still match their documented behavior exactly: `create_household()` returns no id, requires `auth.uid()`, and is the only way to become an owner; `join_household_by_code()` does a case-sensitive `where code = p_code` lookup (unrelated to and unaffected by the client-side `.ilike()` convenience fix, which only applies to the 8 data tables' `household_code` filters, never to this RPC), grants `'contributor'` role unconditionally, and has no rate limiting or owner-approval step — exactly as already decided-against-changing in `OPEN_ITEMS.md`. No drift found.

---

## 6. Security-Relevant Configuration Review — Key Migration State

Re-confirmed, briefly, given how recently and thoroughly this was already covered **within this same session** (not a stale prior-session citation): `getSupabaseClient()`/`fetchCloudRows()`/`upsertCloudRow()`/`deleteCloudRow()` still pass only `settings.supabaseAnonKey` — no `service_role` usage exists anywhere in deployed code, still zero Netlify Functions reference Supabase at all (re-confirmed via the Netlify Function inventory already built in Phase 3, none of the 8 Gemini functions or the 2 non-AI functions touch Supabase). The real household's stored `supabaseAnonKey` was already independently confirmed (this session, structurally, without ever exposing the raw value) to be in the new `sb_publishable_` format, not the legacy JWT shape — the one remaining action is still the dashboard-side legacy-key deactivation, not a code change. Nothing has changed here since that verification.

---

## Categorized Findings

**Confirmed issue**
2. **The exported setup-SQL constants shown to any new household (`AUTH_MIGRATION_SQL`/`AUTH_MIGRATION_FIX_SQL`) still contain the pre-Phase-3 bridge clause**, never updated after Phase 3's live bridge removal on the real production project. A new household following this app's own displayed instructions today provisions the weaker, pre-hardening policy shape.
3. **A household's sole owner can remove their own membership** (`"owners remove members or self leave"` RLS policy, `or user_id = auth.uid()`), with no safeguard anywhere preventing the household from being left with no owner. Resolves Phase 4's low-confidence flag with direct evidence.

**Plausible concern requiring verification**
4. **Family Share sync may currently be blocked entirely by RLS** on the real production database, since its code partition never has a corresponding `households` row and the post-Phase-3 policies gate purely on real membership. Not verified live this session (no database access) — the most direct check is a real "Sync Family Share" attempt. If confirmed broken, this is a functional regression introduced by the (correct, intentional) Phase 3 security hardening, not a new security hole.
5. Contingent on #4: if Family Share access does work via some mechanism not found in this review, its readonly-role enforcement is entirely client-side/self-reported with no server-side backing — the "trusted, not verified" pattern this phase was specifically asked to hunt for, building on Phase 2's already-noted push-guard idiom mismatch in the same function.

**Explained/non-issue**
1. **The live-looking `sb_secret_`-prefixed key and JWT-shaped fragments in `.claude/settings.local.json`** — initially flagged as a new, urgent exposure; confirmed directly with the user afterward to be an intentional, deliberate, local-only, git-ignored mechanism retained specifically to support audit/database-access work. No remediation needed. See Section 2 for the full account.
6. The household_code case-sensitivity client-side fix (`.ilike()` in `fetchCloudRows()`/`deleteCloudRow()`) does not affect `join_household_by_code()`'s or the RLS helper functions' case-sensitive server-side matching — confirmed by re-reading both; this was already understood to be true, re-verified here rather than assumed.
7. Household Sync Code's own cross-household isolation (the original adversarial test's actual subject) is unaffected by anything found or changed in this phase — the membership-check functions are unchanged and the casing fix is a client-side-only convenience layer.

**Previously known and already resolved (re-confirmed fresh, no regression)**
8. `is_member_of_code()`/`is_writable_member_of_code()` as the sole gate on all 8 data tables (for the real, already-executed Phase 3 fix) — re-read and structurally consistent with the documented fix; live confirmation deferred per Finding in section 1 (no session available).
9. `create_household()`/`join_household_by_code()`'s documented self-service, no-rate-limit, no-owner-approval design — re-read in full, unchanged, matching the already-decided-against-fixing `OPEN_ITEMS.md` entry exactly.
10. The `AUTH_MIGRATION_FIX3_SQL` ambiguous-column-name fix (`out_household_id`/`out_role`) — re-confirmed present and matching `db/auth.ts`'s consumption of it (already re-verified earlier this session during the household_code work).
11. Zero deployed dependency on `service_role`; the real anon key already migrated to `sb_publishable_` format; legacy-key deactivation remains the sole outstanding action — re-confirmed, unchanged since this same session's own recent verification.
12. Dev Tools' owner-only access gate keying off real server-side membership data, not a client flag — re-confirmed.

**Requires later-phase investigation**
13. Whether Finding #4 (Family Share RLS access) is actually broken — needs a live test, ideally by the user directly rather than as part of an audit phase.
14. Whether/how to add a last-owner-removal safeguard (Finding #3) — a product/security decision, not an audit conclusion.
15. Whether to refresh the exported setup-SQL constants (Finding #2) to reflect the post-Phase-3 policy shape for future new households.

---

## Recommended Follow-Up Targets for Later Phases

- **Immediate, outside the normal phase cadence**: Finding #4 (possible Family Share breakage) warrants the user's direct attention regardless of when Phase 6 begins, given its potential impact — flagged prominently in the chat response accompanying this report, not just buried in this document. (The credential-scan hit was also flagged with similar urgency in the original version of this report; it has since been clarified directly with the user as an intentional, local-only mechanism — see Section 2 — and no longer requires attention.)
- **Whichever phase or future work touches Cloud Sync setup**: refreshing the exported setup-SQL constants (Finding #2, #15).
- **Account-management hardening**: the last-owner-removal safeguard (Finding #3, #14).

---

*End of Phase 5. No fixes were implemented. No production data or RLS policies were modified. No secret values were reproduced in this document. `OPEN_ITEMS.md` was not edited. Phase 6 has not been started.*
