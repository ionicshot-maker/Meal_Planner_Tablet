# Full-Application Audit — Phase 7: Resilience

**Completed: 2026-08-01.** Scope: recovery/failure scenarios, interruption handling, retry behavior, partial-failure behavior, crash/reload resilience, transactional consistency, long-running operations, offline behavior, startup/recovery behavior, migration/repair recovery behavior, local datastore resilience, cloud-dependent workflow resilience. `AUDIT_PHASE0_BASELINE.md` through `AUDIT_PHASE6_USER_FACING_QUALITY.md` were read in full and treated as established fact — none re-investigated except through the specific lens of "what happens on interruption." This is the final individual audit phase; synthesis and remediation planning are explicitly out of scope here too. Investigation-only pass — no fixes implemented, no production data modified, `OPEN_ITEMS.md` not touched, no synthesis/remediation planning begun.

## Methodology

Re-examined every atomicity/idempotence finding already established by Phases 1–2 specifically through the "what if this is interrupted, not just what if it errors" lens — a genuinely different question for several of them. Searched fresh for any crash/reload recovery mechanism across the app's editing surfaces (a question no prior phase asked), which surfaced a real, previously undocumented asymmetry. Read `src/db/schema.ts`'s `openDB()` call again specifically for multi-tab-upgrade handling, a resilience-specific concern Phase 1 didn't examine (Phase 1 checked whether *indexes* could be silently missed on a version bump; this phase checks what happens if the *upgrade itself* is interrupted or contested by another open tab). Confirmed Phase 6's own forward-referral item — whether Family Share's confirmed failure (Phase 5) is a clean error or a silent hang — using evidence already captured live during Phase 5's test rather than re-testing.

---

## Failure-Mode Inventory

| Operation | Can fail partially? | Where reviewed |
|---|---|---|
| JSON Import / Bulk Entry / Starter Library seeding | Yes — per-item loop, no shared transaction (deliberate, Phase 1) | Interruption Analysis |
| Backup Export | No — pure synchronous read + serialize, nothing to interrupt mid-way in a way that corrupts state | Interruption Analysis |
| Backup Import (restore) | No — single atomic 7-store transaction (Phase 1) | Interruption Analysis |
| Cloud Sync (Household) | Yes — per-store try/catch, per-record writes within a store (Phase 2) | Interruption Analysis, Cloud-Dependent Resilience |
| Family Share | Yes, and currently always does (Phase 5: confirmed RLS failure) | Cloud-Dependent Resilience |
| Meal-plan day/template save | No — single-record `put()` per call | Interruption Analysis |
| Recipe import (text/URL/photo) | Partially — see Long-Running Operations | Long-Running Operations |
| Receipt Scanner (staged review → Save All) | No, once Save All starts (atomic batch, Phase 1/2) — but see the new finding on the *staging* phase before Save All | Recovery-Mechanism Review, Long-Running Operations |
| Startup migrations/repairs (4 functions) | Yes, per-item, by design — resumable (see Recovery-Mechanism Review) | Recovery-Mechanism Review |
| Database Reset | No — single atomic transaction (Phase 1) | Interruption Analysis |
| Household create/join | Effectively no — see Cloud-Dependent Resilience | Cloud-Dependent Resilience |

---

## Interruption Analysis

**Atomic operations remain atomic against a hard browser close, not just an in-app error** — this is a platform guarantee worth stating explicitly rather than assumed: an IndexedDB `readwrite` transaction that has not reached `tx.done`/committed when the browser process is killed does not partially commit; the browser's own storage engine guarantees this. This applies to everything Phase 1 already confirmed atomic — `mergeIngredients()`, `applyReceiptSaveBatch()`, `executeImport()`, `performReset()`, `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()`'s local halves — all of them are resilient to a hard crash mid-operation, not just a thrown JS error, because the atomicity guarantee is enforced by the platform, not by the app's try/catch blocks. **Confirmed, not assumed** — this is how IndexedDB transactions are specified to behave, and nothing in this codebase works around or weakens that guarantee.

**Per-item, non-transactional loops (JSON Import, Bulk Entry, Starter Library seeding) are resumable by design, already established in Phase 1** — re-examined here specifically for a hard-crash (not just thrown-error) interruption: since each item's `saveIngredient()` call is its own independent, already-committed `put()`, a crash between item N and N+1 leaves exactly items 1..N committed and nothing else — re-running the import naturally picks up from there via barcode/exact-name dedup, identical to the already-documented thrown-error case. No difference in resilience characteristics between a JS exception and a hard crash for this class of operation.

**Cloud Sync's per-store, per-record write shape (Phase 2) is genuinely retry-safe against interruption at any granularity** — a network loss or browser close mid-sync leaves whatever was already upserted/pulled committed, and a fresh "Sync with Cloud" naturally reconciles the rest via newest-timestamp-wins comparison. This was already Phase 2's conclusion from a data-movement angle; re-confirmed here as also correct from a pure resilience angle — there is no meaningfully "worse" outcome from a mid-sync browser crash than from a mid-sync thrown error.

---

## Recovery-Mechanism Review

The four startup repair/migration functions (`repairLegacyIngredientData()`, `repairSodiumUnitBug()`, `fixMiscategorizedIngredients()`, `migrateIngredientCategories()`) were re-examined specifically for interruption safety, not just idempotence in the steady state (Phase 1's question):

- All four operate as a `getAll()` scan followed by a per-item loop with no shared transaction. If the browser closes partway through any of them, the items already written stay fixed; the ones not yet reached remain in their pre-fix state.
- **Critically, none of them require an explicit "resume from where I left off" mechanism, because they don't need one**: every one of the four re-scans the *entire* dataset from scratch on the next app load and re-applies its own idempotent per-item check (already established in Phase 1 — a fixed record no longer matches the "needs fixing" filter). A mid-pass interruption is therefore silently and correctly recovered from on the very next load, with the only cost being repeated work on already-fixed items (cheap, already noted in Phase 1 as a performance non-issue). This is **resilient by construction**, not by explicit design for interruption specifically, but the effect is the same.
- **`fixMiscategorizedIngredients()`'s version-gate flag (`miscategoryFixed`/`categoryFixRulesVersion`) is only written *after* the loop completes.** If interrupted, the flag is never set, so the *entire* pass (not just the unfinished remainder) re-runs on next load — more redundant work than the other three (which have no gate at all and always re-scan anyway), but not incorrect, since the per-item check makes re-processing an already-fixed item a safe no-op.

**Import conflict resolution (skip/overwrite in Backup Import, Add New/Add+Update/Replace in JSON Import) and duplicate-resolution flows (`resolveIngredientDuplicate()`/`resolveRecipeDuplicate()`)** were already established as atomic (local half) in Phase 1/2; from the interruption-specific angle, the same platform-guarantee reasoning above applies — no new finding.

---

## Local Datastore Resilience (IndexedDB)

**A genuine, previously-unexamined gap**: the app's single `openDB()` call (`src/db/schema.ts`) registers only an `upgrade` callback — it does **not** register `blocked`, `blocking`, or `terminated` handlers, all of which the underlying `idb` library (and the native IndexedDB API it wraps) explicitly support for exactly this class of resilience concern. Practical consequence: if a user has the app open in two browser tabs and a new deploy ships a schema version bump, the tab that loads first and triggers the upgrade will have its `versionchange` transaction **silently blocked** by the still-open older tab (which never received a `versionchange` event handler telling it to close/reload) — the upgrading tab's `openDB()` call would hang indefinitely with no error, no timeout, and no message to the user, rather than completing or failing visibly. This has not been a problem *yet* structurally, because every version bump since `DB_VERSION = 5` has only ever added new stores (guarded by `if (!contains(name))`), not altered existing ones, and the additive nature means an already-open older tab wouldn't itself be broken by the delay — but the hang scenario itself is real and unaddressed.

**Schema upgrades themselves are additive and safe** (re-confirming Phase 1's finding from this phase's own angle): every store-creation block is individually guarded by `contains()`, so a partially-upgraded database (e.g., 3 of 5 new stores created before an interruption) would simply have the upgrade callback run again on the next successful open, skipping already-created stores and creating the rest — no corruption, no duplicate-creation errors.

---

## Cloud-Dependent Resilience

- **Cloud Sync and Family Share both degrade gracefully when the network is unavailable** — `getSupabaseClient()` returns `null` when unconfigured (checked before any network attempt), and every sync function's network calls are wrapped such that a failure produces a clean, catchable error rather than an unhandled rejection or a hung UI state. This matches the Help page's own claim (Phase 6, re-confirmed here from the resilience angle) that offline use is fully supported except for the explicitly cloud/AI-dependent features.
- **`useSupabaseAuth()`'s session check does not block the app**: it reads Supabase's own locally-persisted session state (fast, no network wait in the common case) and is scoped to `AccountSection`'s own `loading` state — a slow or failed auth check would, at worst, leave that one Settings sub-section showing "Checking sign-in status…" briefly; it cannot hang the rest of the app, since nothing else in `App.tsx`'s startup sequence depends on it.
- **Family Share's confirmed failure (Phase 5) is a clean, immediate error, not a silent hang** — directly confirmed by the evidence already captured during Phase 5's live test: the error text appeared within seconds, "Last synced on this device" remained accurately at "never" (no false-positive success state), and the Sync button returned to its normal clickable label rather than staying stuck on "Syncing…" — consistent with `handleFamilySync()`'s `finally { setFamilySyncing(false) }` always running regardless of outcome. This directly answers the specific question Phase 6 flagged forward to this phase.
- **Household create/join interruption is recoverable**: if a browser closes between `create_household()`'s RPC succeeding and the client saving the returned code locally, nothing is lost server-side — `getMyHouseholds()` (used by `AccountSection`'s `refresh()`) queries `household_members` by the signed-in user's id, independent of any local settings value, so simply reopening the app and viewing the Account box would re-display the real household and its canonical code. The only local consequence of an interrupted create/join is a device that hasn't yet learned its own household's sync code — recoverable by revisiting a page that already exists for an unrelated reason, not a dead end.

---

## Long-Running Operations Review

**The main finding of this phase**: crash/reload recovery for in-progress editing work is real but **inconsistently applied across the app's editing surfaces**, and applied to the wrong place if only one surface could have it.

- **The single-item Ingredient Import review stage** (`ReviewScreen.tsx`, covering Barcode/USDA/Gemini/Scan Label results before saving) has a genuine, working localStorage-based draft mechanism: an explicit **"Save Draft"** button (`handleSaveDraft()`) persists the current draft ingredient plus its nutrition source and timestamp; `IngredientImportPage.tsx` checks for a pending draft on mount and shows a resume banner ("Resume" / "Discard") if one exists. This is a real, if **opt-in** (manual-click, not automatic/periodic) recovery mechanism — a genuine crash with no prior "Save Draft" click still loses the in-progress review entirely, since nothing is written to `localStorage` until that button is pressed.
- **No equivalent mechanism exists anywhere else.** A targeted search found zero `localStorage` usage in `ReceiptLineReview.tsx` (the multi-line, per-item-editable Receipt Scanner review — often the most editing-intensive single session in the app, given a real receipt can have 10+ lines each needing a match/create decision, a price decision, and possibly manual corrections), zero in `BulkEntryTab.tsx` (a multi-row manual-entry table), and zero in `RecipeEditor.tsx` (arguably the single most complex, highest-effort editing surface in the entire application — name, tags, ingredients, steps, servings, prep/cook time, notes, photo). **A browser crash, accidental tab close, or reload at any point during a Receipt Scanner review, a Bulk Entry session, or recipe editing loses all unsaved work with no resume path whatsoever** — not even the limited, opt-in protection the single-item ingredient review has.
- This is backwards from an ideal risk-weighted design: the one workflow with *some* recovery mechanism (single-item ingredient review) is also the *lowest*-effort-to-redo of the group (one item, a handful of fields); the three workflows with *zero* recovery mechanism are the *highest*-effort-to-redo (a multi-line receipt review, a multi-row bulk table, or a full recipe with steps and ingredients).
- **Recipe import (text/URL/photo)** doesn't need the same kind of draft mechanism for a different reason: the *source* (pasted text, a URL, a photo) is either still in the user's clipboard/browser history or the original physical page/receipt, so redoing the *AI call* is cheap even if the *review* afterward would need to be redone — this is a materially different risk profile than hand-entered/hand-corrected data, and its absence of a draft mechanism is not flagged as a gap for that reason.
- **Exports and Cloud Sync are not long-running in the "user is actively editing" sense** — they're fire-and-forget operations with their own already-reviewed progress/retry semantics (Phase 1/2/6), not editing sessions that can lose unsaved human input. Not applicable to this specific finding.

---

## Categorized Findings

**Confirmed issue**
1. **Crash/reload recovery for in-progress editing is inconsistently applied, and inversely correlated with effort-to-redo.** Only the single-item ingredient review has a (manual, opt-in) draft-recovery mechanism; Receipt Scanner's multi-line review, Bulk Entry's multi-row table, and RecipeEditor — the three highest-effort, most failure-costly editing surfaces in the app — have none at all.
2. **`openDB()` registers no `blocked`/`blocking`/`terminated` handlers.** A multi-tab scenario during a future schema version bump could leave the upgrading tab hanging indefinitely with no error or user-visible message. Not yet triggered (every version bump so far has been purely additive), but the gap itself is real and unaddressed in the current code.

**Plausible concern requiring verification**
3. The ingredient-review draft mechanism's opt-in nature (a manual "Save Draft" click required before any protection exists) means the single most likely real-world interruption — an unexpected crash with no warning — still isn't covered even for the one workflow that has partial protection. Whether this is an acceptable trade-off (vs. an automatic periodic save) is a design question, not confirmed as a defect on its own.

**Explained/non-issue**
4. IndexedDB transactions (`mergeIngredients()`, `applyReceiptSaveBatch()`, `executeImport()`, `performReset()`) remain atomic against a hard browser crash, not just a thrown error — a platform-level guarantee, confirmed applicable here, not assumed.
5. The four startup repair/migration functions are safely resumable after a mid-pass interruption via their own already-idempotent per-item checks (Phase 1), without needing an explicit resume cursor — re-confirmed from the interruption-specific angle, no new gap found.
6. Cloud Sync's per-store/per-record write shape is retry-safe at any interruption granularity, consistent with Phase 2's data-movement conclusion, now also confirmed correct from the pure resilience angle.
7. Household create/join interruption is recoverable via `getMyHouseholds()`'s independent, server-side-sourced membership lookup — no dead end.
8. Offline behavior matches the Help page's own claim (Phase 6): non-cloud/non-AI features work fully offline, and cloud-dependent features degrade with clean errors rather than hangs.
9. Family Share's confirmed failure (Phase 5) is a clean, immediate error, not a silent hang — directly answers Phase 6's forward-referred question.
10. IndexedDB schema upgrades are additive and individually guarded, so a partially-completed upgrade (interrupted mid-way through creating several new stores) self-heals correctly on the next successful open.

**Previously known and already resolved (cited, not re-derived)**
11. Atomicity of `mergeIngredients()`/`applyReceiptSaveBatch()`/`executeImport()`/`performReset()` (Phase 1) — the foundation this phase's platform-guarantee reasoning builds on.
12. JSON Import/Bulk Entry/Starter Library's deliberate per-item, dedup-safe (not transactional) design (Phase 1) — re-confirmed as the correct, already-understood trade-off for that class of operation.
13. Cloud Sync's per-store try/catch and Family Share's RLS-confirmed failure mode (Phases 2/5) — both cited as inputs to this phase's cloud-resilience conclusions, not re-investigated.

**Requires later-phase investigation (→ synthesis)**
14. Whether Receipt Scanner, Bulk Entry, and/or RecipeEditor should gain a draft-recovery mechanism comparable to the ingredient review stage's (finding #1) — a real product/engineering decision, not an audit conclusion.
15. Whether `openDB()` needs `blocked`/`blocking` handling before a future non-additive schema change makes finding #2 more than theoretical.

---

## Candidates for Final Audit Synthesis

- **Finding #1 (inconsistent draft-recovery coverage)** is this phase's most concrete, actionable discovery and pairs naturally with Phase 6's user-facing-quality lens (losing an hour of recipe-editing work to a crash is very much a user-trust question, not just a technical one).
- **Finding #2 (`openDB()` missing multi-tab handlers)** is a genuine latent gap worth carrying into synthesis even though it hasn't caused a visible problem yet, given this project's history of "worked fine until a specific combination of circumstances actually occurred" (the casing-drift and reference-integrity findings across earlier phases followed exactly this shape).
- **The overall resilience picture is strong**: every operation that *should* be atomic against interruption *is*, confirmed at the platform-guarantee level, not just the application-logic level; every retry-safe operation was re-confirmed retry-safe against a hard crash specifically, not just a thrown error; and the one confirmed-broken cloud feature (Family Share) fails cleanly rather than compounding its Phase 5 issue with a resilience issue too.

---

*End of Phase 7 — the final individual audit phase. No fixes were implemented. No production data was modified. `OPEN_ITEMS.md` was not edited. No audit synthesis or remediation planning has been begun.*
