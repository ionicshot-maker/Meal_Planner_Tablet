# Full-Application Audit — Phase 6: User-Facing Quality

**Completed: 2026-08-01.** Scope: UX consistency, user guidance, feature discoverability, workflow consistency, onboarding friction, confusing/misleading behavior, UI state consistency, error messaging quality, operation feedback quality, terminology consistency, and documentation drift where it affects user understanding. `AUDIT_PHASE0_BASELINE.md` through `AUDIT_PHASE5_SECURITY_PRIVACY.md` were read in full and treated as established fact — none of their findings were re-investigated from scratch. Security/RLS, AI internals, sync mechanics, data integrity, and configuration internals were out of scope except where directly needed to explain a user-facing symptom. Investigation-only pass — no fixes implemented, no production data modified, `OPEN_ITEMS.md` not touched, Phase 7 not started.

## Methodology

Read `src/pages/Help/HelpPage.tsx` in full — 773 lines, every section — since it is the primary first-party source of "what does the app tell the user to expect," distinct from `MealPlannerApp_Reference.md` (a developer-facing document already covered by earlier phases). Cross-checked the Help page's Family Share content specifically against Phase 5's live-verified finding that Family Share sync currently fails with an RLS-denial error, since that is the sharpest possible test of "documentation vs. behavior" available this phase. Traced the actual component wiring behind Family Share's and Household Sync's error displays (`CloudSyncSection.tsx`) to determine, at the code level, whether the disparity observed live in Phase 5's test was a one-off or a structural gap. Applied the standing cross-phase instruction explicitly: looked for "trusted, not verified," "silent divergence between related values," "documentation/behavior mismatches," and "promised functionality with no effective execution path" from a user-facing rather than technical angle, building on (not re-deriving) Phases 1–5's own findings of each pattern.

---

## User-Facing Surface Inventory

Built on Phase 0's feature inventory; only workflows with a user-facing quality observation are detailed below. Everything else reviewed (Ingredients, Cookbook, Meal Planner, Macro Tracker, Grocery List, the 7 Import Ingredients tabs) was found consistent in terminology, discoverability, and feedback with no new finding — each has a `PageHelpButton` linking to its own Help section, consistent card/list visual patterns, and explicit-save-required workflows (nothing auto-commits without a user action, confirmed already true across every import tab per Phase 2/3).

| Workflow | Discoverability | Consistency | Feedback | Terminology | Guidance coverage |
|---|---|---|---|---|---|
| Household Sync | Good — one clearly-labeled card in Settings → Data | Consistent with itself | **Full Operation Feedback & Trust treatment** (calm `OperationStatus`, reassuring retry framing) | "Household Sync Code" used identically everywhere (UI, Help, FAQ) | Help section, FAQ (×2), Troubleshooting entry all present |
| Family Share | Adequate — same page, clearly labeled | **Inconsistent with its own sibling feature** (see Error/Feedback Review) | **Bare technical error text, no reassurance, no retry framing** | "Family Share Code" used consistently | Help section, FAQ (×2) present — **zero Troubleshooting coverage** |
| Backup Export/Import | Good | Export's own description text sets an expectation Import doesn't fulfill (see Documentation vs. Behavior) | Import has full Operation Feedback & Trust treatment (already Phase 1/2-confirmed atomic + well-messaged) | Consistent ("Export"/"Import"/"Backup") | Help/FAQ/Troubleshooting all mention backup export/import |
| SetupChecklist | Good (persistent, prominent) | Its own "Hide" control doesn't persist (Phase 4, cited not re-derived) | N/A | Consistent with Settings section names | N/A — it's guidance itself |
| Dev Tools | **Deliberately hidden from non-owners, and this is documented** (Help explains exactly who sees it and why) | N/A | N/A | Consistent | Explicitly documented in Help's Cloud Sync section |

---

## Error and Feedback Review

**The central finding of this phase**: Family Share and Household Sync are sibling features on the same Settings page, sharing the same underlying error-construction pattern (`` `${label}: ${e.message}` `` in both `runSync()` and `runFamilyShareSync()`), but they are **not equally well presented to the user**, and this is now backed by both live evidence (Phase 5's actual test) and code-level confirmation (this phase):

- **Household Sync's errors** are wrapped by `buildSyncErrorMessage()` and rendered through the shared `OperationStatus` component (`CloudSyncSection.tsx:330`), producing a message of the shape: *"[raw error text]. N items synced successfully despite this. You can retry — already-synced items won't be duplicated."* — calm, reassuring, actionable. `SyncResultDisplay` is explicitly rendered with `showSummary={false}` for this path (line 334), suppressing its own raw error listing so the message isn't shown twice or inconsistently.
- **Family Share's errors** go through the same `SyncResultDisplay` component but **without** `showSummary={false}` (line 393), so `showSummary` defaults to `true` and the component's raw `summary.errors.map(...)` listing (line 510) is what the user actually sees — with no `OperationStatus` wrapper, no `buildSyncErrorMessage()` reassurance, and no retry guidance. Phase 5's live test confirmed exactly this: the on-screen result was the bare text *"Recipes: Supabase upsert error (recipes): new row violates row-level security policy for table "recipes""* and *"Ingredients: Supabase upsert error (ingredients): new row violates row-level security policy for table "ingredients""* — internal architecture terms (Supabase, row-level security, raw table names) surfaced directly to an end user with no translation, no "nothing was lost" framing, and no next step.
- **This is not a coincidence — it's an omission from a named, already-completed initiative.** `OPEN_ITEMS.md`'s "Operation Feedback & Trust" roadmap explicitly lists its scope as Cloud Sync, Backup Import, JSON Import, Bulk Entry, and Starter Library loading. **Family Share is not on that list.** Household Sync got the full treatment (Phase 1 of that roadmap, per `OPEN_ITEMS.md`); Family Share, syncing through the exact same underlying functions, was simply never brought along.
- **Every other reviewed operation** (Backup Import, Reset, JSON Import, Bulk Entry — all already documented in Phases 1/2 as atomic with matching "nothing was changed" / "you can retry" framing) is consistent with Household Sync's standard, not Family Share's. Family Share is the one outlier.

---

## Documentation vs. Behavior Review

**Confirmed, high-confidence finding**: `HelpPage.tsx` describes Family Share as fully functional in **three separate places** — the main Cloud Sync & Sign In section ("How to share: ... They enter it on their device and tap 'Pull from Family' to get your recipes"), and two FAQ entries ("Why does my family member not see my prices?" and "How do I disconnect a family member from Family Share?"). None of the three carries any caveat, warning, or troubleshooting pointer. Given Phase 5's live-verified finding that Family Share sync fails outright with an RLS-denial error on the very first write (and, by the same RLS mechanism, a "Pull from Family" read would fail identically, since both directions are gated by the same `is_member_of_code()`/`is_writable_member_of_code()` check against a `households` row that never exists for a family-share code) — **the Help page currently promises a working, step-by-step workflow that cannot currently complete.** This is the clearest possible instance of "promised functionality with no effective execution path," evaluated here from the user's perspective: a real user following the Help page's own instructions verbatim would hit the same wall this audit did, with no in-app guidance telling them why or what to do about it.

**A second, softer instance of the same pattern**: `DataSection.tsx`'s Export card describes "Full backup includes settings, ingredients, recipes, meal plans, macro history, grocery lists, and household items" — explicitly naming settings as included. Phase 2 already established (code-level) that `executeImport()` never restores `data.settings` on the way back in. From a user-facing angle, the new observation here is that **nothing in the Import card's own description, the Help page, or the FAQ ever clarifies this asymmetry** — a user who exports a "Full Backup" specifically to preserve their household name, person profiles, custom categories, or nutrient toggles, and later restores it (e.g., after a Reset Everything or on a new device), would reasonably expect those to come back, and they silently won't, with no warning anywhere in the surfaces a normal user would actually read.

**Already-known instance, cited not re-derived**: Phase 1 already found `MealPlannerApp_Reference.md`'s "Shopping History: a collapsible archive of past completed/archived lists" (plural) doesn't match `archiveAndPrune()`'s actual 1-list retention. That finding is a developer-doc-vs-code mismatch; this phase's contribution is confirming the **user-facing** surfaces (Help page, in-app copy) don't independently make the same overstated claim — the Grocery List page and Help section describe "Shopping History" without specifying a retained count, so an ordinary user isn't directly mis-promised the way the reference doc's own wording is. Classified as explained/non-issue from the user-facing angle specifically, while the developer-doc mismatch itself remains Phase 1's finding to own.

---

## Workflow Consistency Review

- **Family Share vs. Household Sync** (detailed above) is the standout inconsistency: same page, same underlying mechanism, visibly different levels of polish in exactly the dimension (error feedback) this project has otherwise worked hard to standardize.
- **The AI-result "fallback model" badge asymmetry Phase 3 already found** (2 of 4 AI-result screens show a muted fallback note; `RecipeImportModal`/`ReferenceEditor` don't, because neither has a persistent post-call badge to attach one to) is, from a user-facing angle, a minor but real terminology/consistency gap: a user who's learned to check the badge on one screen has no equivalent signal on another screen doing conceptually the same job (surfacing which AI model actually answered). Cited from Phase 3, not re-investigated; included here because it's squarely a "workflow consistency" observation once viewed through this phase's lens rather than Phase 3's AI-integration lens.
- **Import tabs are consistently well-behaved as a group**: all 7 Import Ingredients tabs require an explicit save action before anything commits (already established across Phases 2/3), all route through either `ReviewScreen` or their own equivalent confirmation step, and all use consistent terminology ("Add as Ingredient," "Create New," "Skip"). No inconsistency found here — called out as a positive baseline the Family Share gap stands out against.
- **Reset, Backup Import, and Cloud Sync's confirmation/error language is mutually consistent** ("nothing was changed," "you can retry," explicit before/after counts) — this is the project's own established house style, and Family Share simply isn't using it.

---

## Onboarding and Discoverability Review

- **SetupWizard vs. SetupChecklist's scope mismatch** (Phase 4's finding, cited not re-derived) is squarely relevant here: a 2-step wizard that only ever asks for a household name, paired with a persistent 5-item checklist that can remain 1/5 or 0/5 complete indefinitely with no functional consequence, means a new user's sense of "am I done setting up?" doesn't correspond to anything the app itself tracks as a single source of truth. This phase adds one observation Phase 4 didn't: the checklist's copy ("You are fully set up and ready to go!" only appears at 5/5 required + 3/3 optional) is itself well-written and honest about partial states (confirmed via the exact `progressMessage()` string ladder reviewed in Phase 4) — the gap is structural (the Hide button not persisting), not in the wording.
- **Dev Tools' discoverability is a deliberate, well-documented design, not an oversight** — the Help page explicitly explains who sees it and why (owners only), which is exactly the right amount of documentation for a feature that's intentionally narrow-audience.
- **Family Share's discoverability is not the problem** — it's easy to find (same page as Household Sync, same visual treatment) and reasonably well explained in principle. The problem is entirely that what a user finds and follows doesn't work, which is a more serious discoverability failure mode than "hard to find": a *findable, clearly-explained, confidently-documented* feature that silently cannot succeed is arguably worse for user trust than an obscure one, since there's no signal anywhere in the discovery path suggesting caution.
- **No other feature was found to be confusingly hidden or undocumented.** Every page reviewed has a `PageHelpButton`; every Settings tab is named consistently between the tab itself and its Help section anchor.

---

## Categorized Findings

**Confirmed issue**
1. **The Help page (main Cloud Sync section) and two FAQ entries describe Family Share as a working, step-by-step feature with zero caveats**, while Phase 5 live-verified it currently fails completely (RLS denial on both push and, by the same mechanism, pull). This is a direct, user-facing documentation/behavior mismatch with real consequence: a user following the app's own instructions hits a dead end with no warning.
2. **Family Share's error feedback is measurably lower-quality than its sibling Household Sync feature's**, confirmed at the code level: `CloudSyncSection.tsx` renders Household Sync's errors through `OperationStatus`/`buildSyncErrorMessage()` (calm, reassuring, actionable) but renders Family Share's errors through the same `SyncResultDisplay` component with `showSummary` left at its default `true`, surfacing raw technical error text (Supabase/RLS/table-name internals) directly to the user with no translation or guidance. This is also why finding #1 is so easy for a real user to stumble into blind — there's no soft landing.
3. **No Troubleshooting entry exists for Family Share**, despite dedicated entries existing for Household Sync, recipe import, barcode scanning, camera permissions, and data loss. A user who hits the exact error this audit captured live has nowhere in the Help system to turn.

**Plausible concern requiring verification**
4. The Export card's "Full backup includes settings..." description, combined with Import's silent settings-drop (Phase 2) and the complete absence of any in-app clarification, could reasonably mislead a user into believing a restored backup will bring their household configuration back. Not "confirmed" as actively causing user harm (no report of this happening), but the gap between stated and actual behavior is real and undocumented anywhere a user would see it.

**Explained/non-issue**
5. The developer-facing `MealPlannerApp_Reference.md` "Shopping History" plural-wording mismatch (Phase 1) does not have an equivalent user-facing overstatement — the in-app copy and Help page don't independently promise more than `archiveAndPrune()` delivers.
6. Dev Tools' restricted visibility is a deliberate, well-documented design choice, not a discoverability failure.
7. The 7 Import Ingredients tabs' consistency with each other — reviewed fresh from a terminology/workflow angle, found genuinely consistent, no new gap.

**Previously known and already resolved (cited, not re-derived)**
8. Phase 4's SetupChecklist "Hide" persistence gap and the SetupWizard/SetupChecklist scope mismatch — both directly relevant to this phase's onboarding review, correctly not re-investigated.
9. Phase 3's 2-of-4 AI-result-screen badge asymmetry — relevant to this phase's workflow-consistency review as a minor terminology/signal-consistency gap, correctly cited rather than re-audited.
10. Phase 1/2's already-documented atomicity and "nothing was changed" messaging for Reset/Backup Import/JSON Import — confirmed here as the consistent house style Family Share deviates from, not re-verified from scratch.

**Requires later-phase investigation**
11. Whether Family Share's Help/FAQ content and Troubleshooting coverage should be corrected to match reality, and whether its error-feedback path should be brought in line with Household Sync's — both are remediation questions belonging to whichever future work addresses Phase 5's confirmed RLS finding, not to this audit.
12. Whether the Export/Import settings-inclusion messaging (finding #4) needs an explicit caveat.

---

## Recommended Phase 7 Awareness Items

Phase 7 covers Resilience (recovery/failure scenarios, performance) — flagging what's directly adjacent, not asking Phase 7 to fix anything:

- **Family Share's failure mode is a clean, immediate error, not a silent hang or partial-data corruption** — worth Phase 7 briefly confirming this is true system-wide (i.e., the RLS denial surfaces promptly and doesn't leave the UI in a stuck "Syncing…" state), since that's a resilience question sitting right next to this phase's error-quality finding.
- The recurring "same underlying mechanism, inconsistent surrounding treatment" shape found here (Family Share vs. Household Sync) is worth Phase 7 keeping in mind as a pattern-match if it finds a similar resilience-specific asymmetry elsewhere (e.g., one sync path having a timeout/retry safeguard the other lacks).

---

*End of Phase 6. No fixes were implemented. No production data was modified. `OPEN_ITEMS.md` was not edited. Phase 7 has not been started.*
