# Angelo Family Meal Planner — Canonical Audit Record

> This document is the authoritative summary of the 2026-08-01 full-application audit.
>
> It supersedes AUDIT_FINAL_SYNTHESIS.md for future review work.
>
> Individual phase reports remain the source of detailed evidence, methodology, supporting quotations, and historical context.
>
> OPEN_ITEMS.md remains the authoritative backlog, decision-history, implementation-history, and remediation-tracking document.

---

## Audit Date

2026-08-01

---

## Source Documents

### Primary Audit Sources

- AUDIT_PHASE0_BASELINE.md
- AUDIT_PHASE1_DATA_INTEGRITY.md
- AUDIT_PHASE2_DATA_MOVEMENT.md
- AUDIT_PHASE3_AI_INTEGRATIONS.md
- AUDIT_PHASE4_APP_STATE_CONFIG.md
- AUDIT_PHASE5_SECURITY_PRIVACY.md
- AUDIT_PHASE6_USER_FACING_QUALITY.md
- AUDIT_PHASE7_RESILIENCE.md
- AUDIT_FINAL_SYNTHESIS.md

### Supporting Documents

- OPEN_ITEMS.md
- MealPlannerApp_Reference.md
- OPERATION_FEEDBACK_STANDARD.md

---

# Executive Summary

The audit materially improved understanding of the application's current state.

The audit did not materially change the risk assessment of the planned Supabase legacy-key deactivation effort. The application was already understood to have no deployed dependency on the legacy service_role key, and nothing discovered contradicted that understanding.

The audit did uncover several significant findings that would likely not have been discovered through the narrower key-deactivation effort alone:

1. Family Share is currently nonfunctional. — **RESOLVED 2026-08-07**, including the user-facing documentation and error-feedback gaps originally noted here (see Finding #1 below).
2. Backup restore silently drops settings.
3. householdSize and people.length can silently diverge.
4. Household owners can remove themselves and leave a household without an owner.

The strongest recurring architectural pattern discovered was:

## Trusted, Not Verified

The same pattern appeared independently in multiple unrelated subsystems, suggesting a genuine architectural tendency rather than a single isolated defect.

---

# Final Ranked Findings

## #1 — Family Share Is Broken

This is the most heavily corroborated finding in the audit.

Evidence came from:

- Data Movement review
- Security / RLS review
- Live testing
- User-facing documentation review

The audit captured a real production RLS-denial failure during Family Share operation.

Family Share documentation continues to describe the feature as fully working despite the observed failure.

**Confidence:** Very High

---

### Resolution — 2026-08-07

**Backend/functional mechanism: RESOLVED.** The root cause was not the RLS bridge clause (see the causal correction already recorded in `AUDIT_FINAL_SYNTHESIS.md` §4) but a client-side `:family` code-suffix mismatch, confirmed via live reproduction: `runFamilyShareSync()` constructed a suffixed sync code that never matched any real `households` row, causing every Family Share push to fail RLS regardless of role. This is the mechanism `AUDIT_FINAL_SYNTHESIS.md` Finding #4 (Phase 5) hypothesized but explicitly could not verify live at audit time — now confirmed and fixed. A related cost/store-data overwrite risk discovered during that fix was also closed (fetch-then-merge preservation, scoped to the Family Share push path).

**Two directly-related, previously-catalogued findings also closed by this work:**
- **Finding #8** (`runFamilyShareSync()`'s push-guard idiom mismatch, `direction === 'push'` vs. this file's own `!== 'pull'` convention) — corrected as part of the same remediation arc (a companion authoritative role-validation fix), after being independently re-discovered and caught during that fix's own review.
- **Finding #10 / Phase 5 Finding #2** (stale pre-Phase-3 setup-SQL constants shown to new households) — the bridge clause retired from source (`AUTH_MIGRATION_SQL`/`AUTH_MIGRATION_FIX_SQL`), closing the gap Phase 5 named exactly.

**Also resolved, not separately numbered in the original audit:** `AUDIT_FINAL_SYNTHESIS.md` Finding #5 (Phase 5) — Family Share's role enforcement being "entirely client-side/self-reported with no server-side backing" — closed via a new authoritative pre-sync role check (`getMyHouseholds()`), applied to both Family Share and, as new protection, regular Household Sync.

**A new, previously-uncatalogued issue was discovered and resolved during this remediation, not part of the original audit findings**: a general cross-household ID-collision mechanism (affecting any table where an already-synced record's `id` is pushed under a different household), given a working detection/resolution UI (Skip / Push-as-New) and live-verified at real scale.

**Closed, 2026-08-07 (supersedes the prior note below):** Findings #12 and #13, and the `HelpPage.tsx` staleness, are now resolved. Family Share's error/progress feedback now matches Household Sync's (`OperationStatus`, live-verified across success/error/readonly-rejection scenarios); a Troubleshooting entry exists; Help/FAQ content describes the real, current invite-based sharing flow and the real disconnect mechanism (`removeMember()`, a per-member "Remove" control), superseding the retired "Regenerate" references this note originally flagged as unaddressed. Full detail in `OPEN_ITEMS.md`.

Full evidence, methodology, and verification detail for the resolved portions live in `OPEN_ITEMS.md`.

---

## #2 — Backup Restore Silently Drops Settings

Full backup export includes settings.

Restore does not restore settings.

As a result, a household restoring a full backup receives content data but not configuration data.

Examples include:

- household information
- people profiles
- custom categories
- custom brands
- custom stores
- nutrient settings
- related configuration

**Confidence:** High

---

### Confirmation and Scope Clarification — 2026-08-08

**Investigated fresh, alongside the Finding #3 review.** This finding is fully supported by current code — nothing in it is disproven or requires correction. The investigation clarifies its actual scope, which is larger than the original example list suggests.

**Confirmed complete, not partial:** the restore gap affects all 35 fields of the `AppSettings` interface, not only the household-information/preference examples originally listed. The export (`DataSection.tsx`'s `exportData()`) performs a complete, unfiltered dump of `loadSettings()`'s output into the backup; the restore (`executeImport()`) has no corresponding read of `data.settings` anywhere in its logic — every other exported top-level key has a restore counterpart; settings is the sole, complete exception. This means the affected fields include not just household/preference data but also sync and credential configuration (e.g., `supabaseUrl`, `supabaseAnonKey`, `householdSyncCode`, `familyShareCode`) — a broader practical consequence than the original example list conveys.

**Structural observation, offered as evidence, not proven cause:** every field the restore path does handle is array-shaped, gated by an `Array.isArray()` check; `settings` is the export's one singular-object field, which doesn't fit that pattern. Cloud Sync, by contrast, has an explicit, named, per-field-commented exclusion policy (`SYNCED_SETTINGS_KEYS`) for settings it deliberately doesn't sync; no equivalent policy or comment exists anywhere near the backup-restore path. This is consistent with the gap being an oversight rather than a deliberate exclusion, but code alone cannot establish intent with certainty, and this note does not claim to.

See `OPEN_ITEMS.md` for tracking.

**Implemented, 2026-08-08**: see `OPEN_ITEMS.md` for the shipped fix (21/13 field exclusion policy).

---

## #3 — householdSize / people.length Divergence

Two separate values represent household membership.

The application automatically synchronizes them in some workflows but allows them to diverge in others.

Meal-planning macro allocation uses householdSize rather than people.length, allowing silent calculation errors if the two values drift apart.

**Confidence:** High

---

### Correction — 2026-08-08

**Investigated fresh, following the completion of the Family Share remediation arc.** This finding's two component claims need to be separated, because the evidence supports one and disproves the other.

**Confirmed, unchanged:** the divergence mechanism itself is real. `householdSize !== people.length` can and does occur — the household-size stepper (`HouseholdSection.tsx`) writes `householdSize` alone with no corresponding update to `people`, while nothing anywhere in the codebase (no validation in `updateSettings()`/`saveSettings()`) prevents or warns about the resulting mismatch. This part of the original finding stands at its original **High** confidence.

**Disproven:** the claimed harm mechanism — "meal-planning macro allocation uses `householdSize`... allowing silent calculation errors" — does not exist in the current codebase, and exhaustive investigation found no evidence it ever existed. Every read of `householdSize` outside settings-UI and sync code was traced; the sole candidate consumer (`DayLog.tsx`'s props) is provably unused — declared in the component's `Props` type but never destructured or referenced in the function body. `git log --all -S "householdSize"` across the entire repository's history returns exactly two commits ever: the initial commit (already showing this same unused-prop shape) and one unrelated later commit adding `householdSize` to the Cloud Sync allowlist. No calculation logic referencing this field was ever added or removed at any point in this repository's history. Actual macro/serving allocation is driven entirely by `recipe.servings`/`recipe.ingredients` and manually-entered per-person serving counts (`DayLog.tsx`), independent of household size or people-count.

**Net effect:** this finding is corrected and narrowed, not resolved and not retired. `householdSize` is confirmed dead state with respect to any calculation or behavior — its only remaining effects are round-tripping through the Household settings UI and Cloud Sync. The divergence itself remains a real, open, unaddressed data-quality gap; the specific consequence originally attributed to it does not exist. See `OPEN_ITEMS.md` for tracking.

**Implemented, 2026-08-08**: `householdSize` removed entirely (not reconciled) — see `OPEN_ITEMS.md`.

---

## #4 — Owner Self-Removal

RLS policies explicitly allow self-removal.

No safeguard prevents the final remaining household owner from removing their own membership.

This can leave a household without any owner account.

**Confidence:** High

---

### Re-confirmed — 2026-08-08

Investigated fresh, alongside Findings #2/#3. No change: the RLS policy still permits unconditional self-removal, `removeMember()` and the primary household-management UI (`AccountSection.tsx`) still contain no last-owner safeguard, and the resulting ownerless-household condition remains fully possible. Finding stands as originally written.

---

# Audit History Corrections

## Credential Finding Reclassification

Phase 5 originally reported a credential-related finding involving:

- `sb_secret_` material
- JWT-like fragments
- `.claude/settings.local.json`

The original Phase 5 report and the original Final Synthesis treated this as a newly discovered credential exposure and elevated it into the top findings.

A subsequent audit-consistency review determined that this classification did not incorporate later clarification that the credential's presence was:

- intentional
- local-only
- git-ignored
- retained specifically for audit and database-access work
- not being treated as an accidental exposure requiring remediation

### Final Disposition

**Explained / Non-Issue**

The scan legitimately found credential-shaped material.

The interpretation was later corrected.

The finding remains part of the audit history but is no longer considered an active security finding and should not be included in the ranked findings list.

---

# Reclassified / Explained Findings

## Credential Handling Finding

See Audit History Corrections above.

Final status:

**Explained / Non-Issue**

---

# Systemic Patterns

## Pattern 1 — Trusted, Not Verified

Observed independently across:

- Data repair logic
- AI response handling
- Settings handling
- User-input pathways
- Family Share permission handling

Examples include:

- numerical assumptions based on heuristics
- runtime type assumptions
- client-side role trust
- missing validation of AI-supplied values

Most examples remain plausible concerns rather than confirmed production defects.

The significance comes from recurrence across unrelated systems.

---

## Pattern 2 — Documentation Versus Actual Behavior Drift

Examples include:

- Family Share documentation describing a working workflow despite observed failure. — **Resolved 2026-08-07; both the backend and the documentation now match.**
- Backup export language implying settings restoration that restore does not perform.
- Additional documentation mismatches identified throughout the phase audits.

Family Share was the most consequential instance at the time of the audit; both the underlying behavior and its documentation have since been corrected to match.

---

# Positive Confirmations

The audit confirmed several important systems behave correctly.

## Household Isolation and RLS

Cross-household isolation remained intact.

The membership-based authorization model continues to protect household data appropriately.

---

## Atomicity Discipline

Atomic transaction behavior was repeatedly confirmed.

This remains true even during interruption scenarios such as browser crashes or forced closure.

---

## Gemini Discovery and Fallback Infrastructure

The Gemini model-discovery work, fallback system, and reporting improvements were re-reviewed and showed no regression.

---

## Cloud Sync Retry Model

Cloud Sync's retry and interruption-handling model remained internally consistent throughout review.

---

## Credential Architecture

No deployed dependency on service_role keys was identified.

Migration planning conclusions remained unchanged.

---

# Significant Plausible Concerns (Not Confirmed Defects)

These items require verification before being treated as confirmed issues.

1. Runtime validation of AI-supplied numeric values.
2. Person-profile numeric validation gaps.
3. Nested settings-object migration resilience.
4. openDB missing blocked / blocking handlers.
5. Limited draft-recovery coverage on high-effort editing workflows.

---

# Audit Coverage Gaps

The audit did not fully evaluate:

- Performance
- Accessibility
- Cross-browser behavior
- Cross-device behavior
- Live production RLS-state verification via dashboard access

These areas remain substantially unaudited.

---

# Relationship to OPEN_ITEMS.md

This document is not a replacement for OPEN_ITEMS.md.

OPEN_ITEMS.md remains responsible for:

- implementation history
- decision history
- backlog tracking
- remediation planning
- completed-work tracking

This document serves a different purpose:

> A stable summary of audit conclusions and the current understanding of overall system health.

---

# Recommended Future Usage

For future audit-related sessions, provide:

- AUDIT_CANONICAL.md
- OPEN_ITEMS.md
- MealPlannerApp_Reference.md

Only consult the individual phase reports when:

- original evidence is needed
- methodology needs review
- historical wording matters
- a finding must be traced back to its source

This document should be treated as the canonical audit summary and the starting point for future audit discussions.