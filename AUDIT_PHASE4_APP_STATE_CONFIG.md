# Full-Application Audit — Phase 4: App State & Configuration

**Completed: 2026-08-01.** Scope: settings persistence, defaults, configuration management, onboarding/setup flows, settings migrations, local-vs-synced configuration, configuration assumptions, and the full lifecycle of every user-configurable value. `AUDIT_PHASE0_BASELINE.md`, `AUDIT_PHASE1_DATA_INTEGRITY.md`, `AUDIT_PHASE2_DATA_MOVEMENT.md`, and `AUDIT_PHASE3_AI_INTEGRATIONS.md` were read in full and treated as established fact. Unlike Phase 3, this is genuinely first-pass, ground-up work — Phase 0 deliberately excluded a settings field inventory and reserved it for this phase. Investigation-only pass — no code changed, no production data modified, `OPEN_ITEMS.md` not touched, Phase 5 not started.

## Methodology

Started from the full `AppSettings` shape and `DEFAULT_SETTINGS` (both already read in detail during Phase 1, not re-read as unfamiliar) and Phase 2's already-verified `SYNCED_SETTINGS_KEYS` field-by-field breakdown (built on, not re-derived). Read every Settings-page section component that renders a user-editable field (`HouseholdSection.tsx`, `ListsSection.tsx`, relevant portions of `AISection.tsx` not already covered in Phase 3) to confirm actual UI location and validation, rather than inferring it from field names alone. Read `SetupWizard.tsx` and `SetupChecklist.tsx` in full — genuinely new territory. Traced specific settings-dependent calculations (`getPaydaysInRange()` in `mealPlanUtils.ts`, `householdSize`'s consumers) to determine whether an apparently-unvalidated field actually causes bad behavior, rather than flagging "no validation" as a defect on its own.

---

## Complete Settings Field Inventory

Default values are quoted from `DEFAULT_SETTINGS` (`src/db/settings.ts`); synced/local status is Phase 2's already-verified `SYNCED_SETTINGS_KEYS` classification, not re-derived here.

| Field | Default | Synced? | Editable via | Write-time validation | Read-assumption risk |
|---|---|---|---|---|---|
| `householdName` | `''` | ✅ | Household tab, plain text input | **None** — no trim, no length cap | Low — sanitized at each use site (`makeFilename()` trims/slugifies; page-title display is plain text) rather than at write time |
| `unitSystem` | `'imperial'` | ✅ | Preferences tab, radio | Constrained to a union via radio options | None |
| `theme` | `'system'` | ❌ (device-local, documented) | Preferences tab | Constrained via `ThemeContext` | None |
| `fontSizePt` | `14` | ❌ (device-local, documented) | Preferences tab, preset buttons + slider | Constrained by UI (10–20pt slider) | None |
| `ai` (provider/apiKey/ollamaBaseUrl/ollamaModel) | `{provider:'none', apiKey:''}` | Only `.provider` synced (via `aiProvider`, Phase 2) | Integrations tab | Provider constrained via dropdown; keys/URLs free text, no format check | See Phase 3 — Anthropic/OpenAI/Ollama calls trust these values structurally |
| `usdaApiKey` / `geminiApiKey` | `''` | ❌ (documented, personal keys) | Integrations tab | None (free text) | Covered by Phase 3 |
| `geminiModel` | `GEMINI_PRIMARY_MODEL` | ✅ | Integrations tab, chips/Browse all | Constrained to discovery-returned ids via UI | Covered by Phase 3 |
| `lastGeminiResolution` | `undefined` | ❌ (device-local, documented) | Not directly editable — app-written, user-viewed only | N/A | Appropriate for a status/display field |
| `nutrientToggles` | `{saturatedFat:false, transFat:false, alcohol:false, water:false, weight:false}` | ✅ | Nutrients tab, toggles | Boolean, constrained by UI | **See Settings Migration Review — shallow-merge gap** |
| `macroHistoryDays` | `90` | ✅ | Nutrients tab | Clamped client-side (`Math.min(365, Math.max(30, +e.target.value))`, per Phase 2's reading) | None |
| `storePreferenceEnabled` | `false` | ✅ | Preferences tab, toggle | Boolean | None |
| `householdSize` | `1` | ✅ | Household tab, +/- stepper | **Lower-bounded to 1, no upper bound, no reconciliation with `people.length`** | See Configuration Assumption Hunt |
| `people` | `[]` | ✅ | Household tab, Add/Edit/Remove Person modal | Per-field: name free text; age `min=1,max=120` (HTML5 only); weight/height `min=1` (HTML5 only, no max) | See Configuration Assumption Hunt |
| `setupComplete` | `false` | ✅ | Set only by `SetupWizard`'s `finish()`; no UI ever resets it | One-way flag | Appropriate — no "redo onboarding" feature is expected to exist |
| `ingredientCategories` | 21 literal names | ✅ | Lists tab | Trim + case-insensitive dedup + fuzzy-duplicate warning | None — validated pattern, see below |
| `recipeTags` | 6 grouped arrays | ✅ | Lists tab | Same as above, plus `mergeDefaultTags()` restores missing defaults on every load | None |
| `brands` / `stores` | curated lists | ✅ | Lists tab | Same validated-add pattern as categories | None |
| `starterLibrarySeeded` / `starterLibraryVersion` / `brandedLibrarySeeded` | `false` / `0` / `false` | ❌ (documented, per-device onboarding state) | Not directly editable — managed by `StarterLibraryPrompt` | N/A | Appropriate |
| `kitchenReferencePhotoPolicy` | `'ask'` | ❌ (undocumented exclusion, per Phase 2) | Preferences tab, radio (ask/keep/discard) | Constrained via UI | See Local-vs-Synced review below |
| `ingredientDisplay` | `{showNutriscore:true, showNovaGroup:true, showAllergens:true}` | ✅ | Ingredients tab, toggles | Boolean | **See Settings Migration Review — same shallow-merge gap as `nutrientToggles`** |
| `allergenWatchList` | `[]` | ✅ | Ingredients tab, allergen picker | Constrained to the 12-item `ALLERGENS` list | None |
| `miscategoryFixed` / `categoryFixRulesVersion` | `false` / `0` | ❌ (internal bookkeeping) | Not user-facing at all | N/A | Appropriate |
| `supabaseUrl` / `supabaseAnonKey` | `''` | ❌ (self-referential credentials) | Integrations tab | None (free text) | Already covered by prior-session household_code work |
| `householdSyncCode` / `familyShareCode` | `''` | ❌ (self-referential) | Data → Cloud Sync tab | None (free text, already-known unsanitized entry points) | Already known/covered |
| `familyShareRole` | `'owner'` | ❌ (self-referential-adjacent) | Data → Cloud Sync tab, dropdown | Constrained via dropdown | Covered by Phase 2 (push-guard finding) |
| `lastHouseholdSyncAt` / `lastFamilySyncAt` | `undefined` | ❌ (documented, per-device) | Not editable — display only ("Last synced: X ago") | N/A | Appropriate |
| `cloudSyncPromptDismissed` | `false` | ❌ (documented, per-device) | Data tab, "Show the sign-in reminder..." toggle (confirmed present via direct observation this session) | Boolean | Appropriate — has a working reset path |
| `updatedAt` | `new Date(0).toISOString()` | N/A (sync bookkeeping itself) | Not user-facing | N/A | Appropriate |

---

## Onboarding/Setup Flow Review

`SetupWizard.tsx` is a 2-step, 68-line overlay: step 1 is a static welcome screen, step 2 asks for `householdName` only, then calls `finish()`, which sets exactly `{ householdName: householdName.trim(), setupComplete: true }` — nothing else. **There is no step for adding a person, no household-size prompt, nothing beyond a name.** "Skip for now" (shown when the name field is empty) calls the identical `finish()` with an empty name — `setupComplete` becomes `true` either way.

This means `setupComplete` and "the household is actually configured" are **completely decoupled**, by design, not by accident: `SetupChecklist.tsx`'s own 5 "required" items (household name, at least one person, first ingredient, first recipe, first planned meal) can be anywhere from 0/5 to 5/5 complete regardless of `setupComplete`'s value, since the wizard only ever touches one of those five. A household can finish the 2-click wizard and never see it again while still being at 1/5 (or 0/5, if they skipped) on the persistent checklist forever. This is not a bug — the wizard is a minimal quick-start by design, and the persistent checklist is the intended longer-lived nudge — but it does confirm Phase 0's "three getting-started surfaces at different depths" finding has at least one concrete functional consequence beyond pure UX fragmentation: **there is no single flag that means "onboarding is done"** — `setupComplete` means only "the first-run overlay has been dismissed," not "the household is configured," and no part of the app currently treats the two as equivalent (confirmed via `MacroTrackerPage`'s and other pages' own independent empty-state handling for zero people/ingredients/recipes, which exist precisely because `setupComplete` alone can't be relied on to mean "there's data here").

**A concrete, previously-unflagged finding**: `SetupChecklist.tsx`'s "Hide" button toggles a plain `useState` (`collapsed`), with no persistence anywhere — not in `AppSettings`, not in `localStorage`. Every time `SettingsPage` re-mounts (navigating away and back, or a reload), the checklist resets to expanded/visible regardless of whether it was just hidden. This is a genuine lifecycle gap: the one explicit "dismiss this" affordance on this particular surface doesn't actually stick.

**Abandoning setup partway through** (in the sense of an interrupted multi-step flow) isn't really possible given there are only 2 steps and the second one can't itself be interrupted mid-way (a single text field, submitted atomically on `finish()`). The more meaningful "partial configuration" state is the checklist's 0–5/5 spread described above, and every page reviewed that depends on `people`/ingredients/recipes/meal-plan data being present already degrades gracefully (see Configuration Assumption Hunt) — no inconsistent-combination crash was found.

---

## Settings Migration Review

Three genuinely different settings-shape changes were found in this project's history, and they were handled three different ways — worth comparing directly:

1. **`ingredientCategories` (15 → 21 names)**: handled by a **dedicated one-time migration function**, `migrateIngredientCategories()` (`db/settings.ts`), explicitly invoked from `App.tsx` on every load, computing a merged category list and only writing if it actually changed. Not left to the generic `loadSettings()` merge.
2. **`recipeTags`**: handled **inside** `loadSettings()` itself via `mergeDefaultTags()`, which explicitly re-adds any default tag group/tag missing from a household's stored list, on every load. Also not a plain shallow-merge — a dedicated reconciliation step.
3. **Everything else** (every scalar/simple field, plus the two nested toggle objects `nutrientToggles` and `ingredientDisplay`): relies solely on `loadSettings()`'s generic `{ ...DEFAULT_SETTINGS, ...stored }` shallow merge.

**This directly answers the question Phase 1 flagged as a future risk.** Phase 1's concern was that `loadSettings()`'s merge assumes every future new field can be safely default-filled statically, and that this "may not hold for a field needing a computed default." Checking every current field against this: **no current field actually needs a computed (rather than static) default** — every field's literal `DEFAULT_SETTINGS` value is correct for a genuinely brand-new household with nothing else set, which is the only case `DEFAULT_SETTINGS` alone is ever used for (an existing household's `stored` value always wins for any field it already has). So Phase 1's flagged risk has **not yet materialized for any scalar field** — it remains a future risk, not a present violation.

**However, a closely related, currently-latent structural gap was found that Phase 1 didn't specifically name**: the shallow merge only replaces a field *wholesale* — it does not merge *inside* nested objects. `nutrientToggles` and `ingredientDisplay` are both nested objects with no dedicated reconciliation function (unlike `recipeTags`, which explicitly has one). If either object ever gains a new boolean field in the future (the exact kind of change `recipeTags` and `ingredientCategories` have each already been through once), an existing household's stored copy of that object would keep its old shape — the new field would be `undefined`, not the new field's own `DEFAULT_SETTINGS` value, for every household that saved settings before the change. This has **not yet actually happened** to either object as far as this repository's history shows (no evidence either object has ever gained a field since its introduction), so this is not a confirmed defect — but it is a real, presently-existing gap in the mechanism, evidenced by the fact that this project has already needed dedicated fixes for exactly this class of problem twice (`recipeTags`, `ingredientCategories`) without generalizing the fix to cover nested toggle objects the same way.

---

## Local vs. Synced Boundary — Configuration Angle

Building on Phase 2's data-movement finding that `kitchenReferencePhotoPolicy` is excluded from `SYNCED_SETTINGS_KEYS` with no rationale comment: examined here specifically for whether the *classification itself* is correct, not just whether it's documented. **No strong case either way was found.** A household could reasonably want this consistent across devices (a shared household policy on whether to keep scanned photos) — closer in spirit to `ingredientDisplay`/`nutrientToggles`, which do sync. But it could equally reasonably be a per-device storage/preference concern (a phone with limited storage discarding photos while a home tablet keeps them) — closer in spirit to `fontSizePt`/`theme`. Both are equally plausible readings of "what this field represents," and nothing in the code or either prior-session's documentation resolves the ambiguity. This is a genuine product decision to make, not a clear misclassification this audit can resolve on its own — reported here as open, not concluded.

No other field's sync/local classification was found questionable on this same re-examination — every other excluded field (device-local fields, credentials, per-device onboarding flags) has a substantively correct rationale (documented or self-evident), and every synced field genuinely represents shared household policy or content rather than a device/personal preference.

---

## Configuration Assumption Hunt

- **`householdSize` and `people.length` can silently diverge, with no reconciliation.** `HouseholdSection.tsx`'s `savePerson()`/`deletePerson()` explicitly keep `householdSize` in sync with `people.length` on every add/remove. But the manual `+`/`−` stepper next to "Household size" changes `householdSize` completely independently, with no upper bound and no link back to `people.length`. `householdSize` (not `people.length`) is what meal-plan "Shared" macro-splitting actually divides by (confirmed via its prop-threading into `DayLog`/the shared macro-calculation path) — meaning a household that, say, adds a 3rd person profile (auto-syncing `householdSize` to 3) and later manually decrements the stepper back to 2 for some unrelated reason would silently under-divide every future shared meal's macros by 2 instead of 3, with no warning that the two numbers disagree.
- **Person-profile numeric fields (age/weight/height) carry only cosmetic HTML5 `min`/`max` attributes** — not enforced by any submit-time or write-time check in `PersonModal`'s plain per-keystroke `onChange` handlers. An extreme, zero-adjacent, or (via paste) negative value could be saved and would flow uncorrected into `calculateTDEE()` — the same "trusted, not verified" numeric-input pattern Phase 1 flagged for `repairSodiumUnitBug()` and Phase 3 flagged for `gemini-nutrition`'s macro fields, now found a third time in the settings layer itself.
- **`paydaySchedule.nextPayday` defaults to an empty string** when a user toggles Payday Schedule on without picking a date — traced this fully through `getPaydaysInRange()` (`mealPlanUtils.ts`): every one of its three frequency branches (weekly/biweekly, semi-monthly, monthly) calls `parseDateLocal('')` at some point, producing `Invalid Date`; every subsequent comparison against an `Invalid Date` evaluates to `false` (standard JS `NaN` comparison semantics), so every branch's loop guard short-circuits immediately and the function returns zero computed paydays for that person — no crash, no infinite loop (each branch also has its own independent safety counter). **This looked like an unvalidated-input risk and traced out to be genuinely safe.**
- **`MacroTrackerPage`'s zero-people case** has an explicit, graceful empty state (`"No people configured. Add profiles in Settings → Household..."`) rather than crashing or rendering a blank/confusing UI.
- **`ListsSection.tsx`'s free-text category/brand/store/tag entry** already has real, working validation — trim-empty rejection, case-insensitive exact-duplicate rejection, and a Levenshtein-distance (≤2) near-duplicate warning — unlike the household-code free-text entry points flagged in prior-session work. Not a comparable risk.
- **`householdName`'s complete absence of write-time validation** (no trim, no length cap) was traced to its two real consumers — `makeFilename()` (Phase 2, trims/slugifies at use time) and page-title display (plain text, safely escaped by React) — both handle an unsanitized value safely at the point of use. Deliberate-looking pattern (validate/sanitize at use, not at write), consistent across the fields checked, not a gap.

---

## Lifecycle Completeness Review

Sampled across data types, as requested — a string field, a boolean, an array, and a nested object:

- **String** (`householdName`): create (SetupWizard or Household tab) → view (displayed as page-title prefix, shown in the Household tab input) → edit (same input, live) → reset (clear the field manually; no dedicated "reset" button, but manual clearing is fully equivalent for a plain string). Complete.
- **Boolean** (`cloudSyncPromptDismissed`): create/edit (implicitly set `true` on dismissing the banner) → view/reset (the Data tab's "Show the sign-in reminder on launch when not signed in" toggle, confirmed present via direct on-screen observation earlier this session) — a full, working create→view→edit→reset cycle, including the reset path other boolean-adjacent flags in this table lack.
- **Array** (`allergenWatchList`): create/edit (Ingredients tab's allergen picker, checkbox-style against the fixed 12-item `ALLERGENS` list) → view (same picker reflects current state) → reset (uncheck everything, returning to `[]`, the documented default). Complete.
- **Nested object** (`people[].paydaySchedule`): create (toggle on, in `PersonModal`) → view/edit (frequency/date/color fields, shown whenever the toggle is on) → reset (toggle off, which sets the whole sub-object back to `undefined` — confirmed via `set('paydaySchedule', v ? {...} : undefined)`). Complete, and notably the cleanest reset semantics of any field sampled — toggling off doesn't just hide the UI, it actually clears the stored value.

**No write-only field was found** among those sampled or spot-checked elsewhere in the inventory — every user-editable field has a corresponding read/display surface somewhere in the Settings UI. The closest exception is `setupComplete`, which is genuinely one-way by design (no "redo onboarding" feature exists anywhere, and none was expected to).

---

## Categorized Findings

**Confirmed issue**
1. `SetupChecklist.tsx`'s "Hide" collapse state is unpersisted plain `useState` — it silently resets to expanded on every Settings-page remount, regardless of the user having just hidden it.
2. `householdSize` and `people.length` can silently diverge — the manual stepper and the auto-sync-on-add/remove-person logic are two independent write paths with no reconciliation, and `householdSize` (not `people.length`) is what shared-meal macro-splitting actually uses.

**Plausible concern requiring verification**
3. Person-profile numeric fields (age/weight/height) have only cosmetic HTML5 min/max attributes, not enforced at write time — an extreme value would flow uncorrected into TDEE calculation, the same pattern Phase 1 and Phase 3 each found once already, now found a third time.
4. The nested-object shallow-merge gap in `loadSettings()` (`nutrientToggles`/`ingredientDisplay` have no `recipeTags`-style reconciliation function) — not yet triggered by any actual field addition, but a real, presently-existing gap in the mechanism.
5. `kitchenReferencePhotoPolicy`'s sync classification remains genuinely ambiguous even after specific re-examination — not resolved as either clearly correct or clearly wrong.

**Explained/non-issue**
6. Empty-string `paydaySchedule.nextPayday` — traced fully through `getPaydaysInRange()`; degrades safely to zero computed paydays via `Invalid Date`/`NaN` comparison semantics, never crashes.
7. Zero-people handling on `MacroTrackerPage` — explicit, graceful empty state already exists.
8. `ListsSection.tsx`'s free-text entry points — already has real trim/dedup/fuzzy-duplicate validation, not comparable to the known-unsanitized household-code entry points.
9. `householdName`'s lack of write-time validation — safely handled at every actual use site; a deliberate validate-at-use pattern, not a gap.
10. `setupComplete`/`SetupWizard` being decoupled from "household actually configured" — by design; every page depending on real data already has its own independent empty-state handling.

**Previously known and already resolved (built on, not re-derived)**
11. `SYNCED_SETTINGS_KEYS`'s field-by-field correctness (Phase 2) — used as the basis for this phase's inventory table rather than re-verified from scratch.
12. `loadSettings()`'s static-default-merge assumption (Phase 1) — this phase specifically checked every current field against it (see Settings Migration Review) rather than re-flagging the assumption itself as new.

**Requires later-phase investigation**
13. Whether the SetupChecklist persistence gap (#1) and `householdSize`/`people.length` divergence (#2) warrant a fix, and what the correct behavior should be for each.
14. Whether `kitchenReferencePhotoPolicy` should sync (#5) — a product decision Phase 2 also couldn't resolve; still open.
15. Whether person-profile numeric fields (#3) need server/write-time range validation, and whether `nutrientToggles`/`ingredientDisplay` need a `recipeTags`-style reconciliation function before either is ever extended (#4).

---

## Recommended Follow-Up Targets for Later Phases

- **Whichever phase covers UX consistency/onboarding polish**: the SetupChecklist persistence gap and the three-surfaces decoupling (findings #1, #10).
- **A future data-integrity or settings-hardening pass**: the `householdSize`/`people.length` divergence (#2) and person-profile numeric validation (#3) — both feed directly into macro/TDEE calculations.
- **Whichever phase or future settings change actually adds a field to `nutrientToggles`/`ingredientDisplay`**: build in a `recipeTags`-style reconciliation at that time, per finding #4, rather than assuming the plain shallow merge will cover it.
- **Product scoping, not an audit conclusion**: `kitchenReferencePhotoPolicy`'s sync classification (#5) needs a decision, not further investigation.

---

*End of Phase 4. No fixes were implemented. No production data was modified. `OPEN_ITEMS.md` was not edited. Phase 5 has not been started.*
