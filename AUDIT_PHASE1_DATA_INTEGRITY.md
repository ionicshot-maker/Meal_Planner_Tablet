# Full-Application Audit — Phase 1: Data Integrity & Correctness

**Completed: 2026-08-01.** Scope: ingredient data, recipe data, dead code, stale assumptions. Cloud Sync reliability, imports/exports as a UX flow, Family Share, onboarding, Gemini integrations, UX consistency, documentation quality, performance, and security/RLS were deliberately out of scope except where directly required to answer a data-integrity question. This is an investigation-only pass — no code was changed, no production data was modified, `OPEN_ITEMS.md` was not touched, and Phase 2 was not started.

## Methodology

Started from `AUDIT_PHASE0_BASELINE.md`'s inventory rather than re-deriving it. For every persisted entity: read `src/types/index.ts` (shape), `src/db/schema.ts` (storage/indexes), and every function in the entity's `src/db/*.ts` module (create/read/write/delete). Cross-checked every automatic-mutation function named in Phase 0 by re-reading its current implementation directly — not trusted from memory or from prior session summaries, per the task's explicit instruction not to assume previously-fixed paths are permanently safe. Searched for callers of every write/delete/prune function to confirm actual trigger conditions rather than assuming them from comments. Cross-checked several code comments' factual claims (e.g. "both current callers pass `{fuzzy:false}`") against a fresh repo-wide grep rather than accepting the comment at face value.

---

## Data Model Inventory

All 11 IndexedDB object stores in `MealPlannerDB` (`src/db/schema.ts`), version 5. Every store except `settings` is created only if absent (`db.objectStoreNames.contains(name)`), with indexes defined once at creation time in the same guarded block.

| Entity | Store / key | Created via | Major write paths | Major read paths | Validation |
|---|---|---|---|---|---|
| **Ingredient** (`ingredients`) | keyPath `id`, indexes `by-category`/`by-name` | `IngredientForm` (manual), Barcode/USDA/Gemini/Scan Label/Receipt Scanner/Bulk Entry/JSON Import (all via `ReviewScreen`/`ReceiptLineReview`/`normalizeIngredient()`), starter/branded library seeding | `saveIngredient`, `archiveIngredient`, `addVariantToIngredient`, `applyReceiptSaveBatch` (atomic, 3-store), `mergeIngredients` (atomic, 4-store), `updateVariantPrice`, the 4 App-load repair/migration functions (below) | `getAllIngredients`, `getIngredient`, `getIngredientsByCategory`, `searchIngredients`, `findIngredientByBarcode` (in-memory scan) | Field shape only via `normalizeIngredient()`/`normalizeVariant()` on import paths; the direct-edit UI (`IngredientForm`) has its own form-level validation, not reviewed in this pass since it's a UI-layer concern, not a persisted-data-path concern |
| **Recipe** (`recipes`) | keyPath `id`, index `by-name` | `RecipeEditor` (manual/AI-import), `cloneRecipeFromTemplate()` | `saveRecipe`, `deleteRecipe`, `repointRecipeReferences` (atomic, 5-store, via Cloud Sync duplicate resolution) | `getAllRecipes`, `getRecipe`, `getFavoriteRecipes`, `getRecipeTemplates`, `searchRecipes` | None at the `db/recipes.ts` level — shape enforced by `RecipeEditor`'s form state only |
| **RecipeCollection** (`collections`) | keyPath `id`, index `by-name` | `createCollection()` | `saveCollection`, `addRecipeToCollection`, `removeRecipeFromCollection`, `reorderCollectionRecipes`, `deleteCollection` | `getAllCollections` | None beyond TS types |
| **KitchenReference** (`references`) | keyPath `id`, index `by-title` | `ReferenceEditor` (manual or AI photo-scan) | `saveReference`, `deleteReference` | `getAllReferences`, `getReference` | None beyond TS types |
| **GroceryList** (`groceryLists`) | keyPath `id`, indexes `by-status`/`by-date` | `GroceryGenerator` | `saveGroceryList`, `deleteGroceryList`, **`archiveAndPrune()`** (see Automatic-Mutation Review — this is a real, silent, permanent bulk-delete path) | `getActiveGroceryList`, `getGroceryHistory`, `getActiveGroceryListsInRange` | None beyond TS types |
| **HouseholdItem** (`householdItems`) | keyPath `id` | `HouseholdModal` (Quick Add/Manage) | `saveHouseholdItem`, `deleteHouseholdItem` | `getAllHouseholdItems` | None |
| **MealPlanDay** (`mealPlanDays`) | keyPath `date` (ISO string — exactly one record per calendar date, globally) | Implicitly, the first time any day is touched | `saveMealPlanDay` (called by `handleDayUpdate`, `handleApplyTemplate`, `handleCopyWeek` — **persists a record even when every meal slot is empty**), `deleteMealPlanDay` (defined; see Write-Path Audit for caller status) | `getMealPlanDay`, `getMealPlanDays`, `getPlannedDayCount` (filters to non-empty days only — see Baseline-Discrepancy Analysis) | None |
| **MealPlanWeekTemplate** (`mealPlanTemplates`) | keyPath `id` | `handleSaveTemplate()` (`MealPlannerPage.tsx`) | `saveMealPlanTemplate`, `deleteMealPlanTemplate`, repointed as part of `repointRecipeReferences` | `getAllMealPlanTemplates` | None |
| **MacroLogEntry** (`macroLogs`) | keyPath `id`, indexes `by-date`/`by-person`/`by-date-person` | `DayLog.tsx`'s manual/plan-item logging | `saveEntry`, `deleteEntry`, repointed as part of `mergeIngredients`/`resolveIngredientDuplicate`/`repointRecipeReferences`, **`pruneOldEntries(maxDays)`** — see Automatic-Mutation Review, this function is dead code | `getEntriesForDay`, `getEntriesForRange`, `getMacroLogCount` | None |
| **ProcessedReceipt** (`processedReceipts`) | keyPath `id` | Written at the end of a successful Receipt Scanner "Save All" | `saveProcessedReceipt` (also written inside `applyReceiptSaveBatch`) | `getAllProcessedReceipts`, `findMatchingProcessedReceipt` (soft duplicate-scan warning) | None |
| **AppSettings** (`settings`) | out-of-line key `'app'`, single record | `DEFAULT_SETTINGS` on first load | `saveSettings`, `saveSettingsWithTimestamp` (Cloud Sync merge path), `patchSettings` | `loadSettings` (merges stored over `DEFAULT_SETTINGS`, then `mergeDefaultTags()` restores any missing default recipe-tag groups) | None beyond TS types; `loadSettings()`'s merge-over-defaults is itself a quiet, permanent per-field migration mechanism — see Stale-Assumption Hunt |

No additional persisted user-content entity was discovered beyond Phase 0's list and `AppSettings`.

---

## Write-Path Audit

Every create/update/import/merge/repair/migrate/delete path was traced per entity above. Three things are worth calling out beyond the inventory table:

1. **Every multi-record mutation that has previously been the subject of an atomicity fix was re-read in full, not trusted from memory**: `mergeIngredients()`, `applyReceiptSaveBatch()`, `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()` (in `src/db/supabase.ts`, not re-quoted here as Cloud Sync internals are out of this phase's scope, but the local-transaction shape they call into was re-verified), `repointRecipeReferences()`, and `repointIngredientReferences()`. All still use a single `db.transaction([...stores], 'readwrite')` with an explicit `tx.abort()` + rethrow on error, exactly as documented in `OPEN_ITEMS.md`. No regression found.
2. **`deleteMealPlanDay()` (`db/mealPlan.ts:28`) has zero callers anywhere in the app.** Confirmed via repo-wide search — the function is defined and exported but never invoked. Not a correctness bug (nothing depends on it being called), but it means there is currently no way for a day record to ever be removed once created, only ever overwritten with a blank one (see Baseline-Discrepancy Analysis).
3. **Two automatic bulk-mutation paths exist beyond Phase 0's named list of four** — `archiveAndPrune()` (`db/groceryLists.ts`) and `pruneOldEntries()` (`db/macroLogs.ts`). Both are covered in detail below since they materially change the Automatic Data-Mutation Review's scope.

---

## Automatic Data-Mutation Review

### 1. `repairLegacyIngredientData()` (`db/ingredients.ts:100`)
- **Trigger**: every app load, unconditionally (`App.tsx` `useEffect` on `isLoading` going false) — no version flag, no settings gate.
- **Scope**: every ingredient including archived ones (`getAllIngredients(true)`), filtered to those with at least one variant where `!v.macros` or `hasRecoverableFlatMacros(v)` (macros present but all-zero while a flat legacy field is nonzero).
- **Data touched**: reshapes the whole ingredient via `normalizeIngredient()` (shared with the import pipeline), preserving `id`.
- **Safeguards**: reuses the same normalization import paths already validate through; only touches records whose shape is actually broken.
- **Idempotence**: self-limiting by construction — once a record has a populated `macros` object, it no longer matches the filter. Confirmed no version counter is needed because the detection is structural, not flag-based.
- **Termination evidence**: the filter step (`getAllIngredients(true)` + `.filter(...)`) still runs on every load forever; only the write step is skipped once data is clean. This is a permanent per-load full-table scan, not a one-time migration that later removes itself — acceptable for correctness, a mild resilience/performance note for a later phase, not raised here as a defect.

### 2. `repairSodiumUnitBug()` (`db/ingredients.ts:128`)
- **Trigger**: every app load, unconditionally, same pattern as above.
- **Scope**: every ingredient (incl. archived), variants where `macros.sodium > 5000 && macros.sodium % 1000 === 0`.
- **Data touched**: divides `variant.macros.sodium` by 1000 in place.
- **Safeguards**: none beyond the heuristic itself — no logging surfaced to the user beyond a `console.log` count, no allowlist/denylist of known-legitimate high-sodium products.
- **Idempotence**: self-limiting in the overwhelming majority of cases (a divided value is very unlikely to itself be a >5000, exact-multiple-of-1000 value) — but see the Stale-Assumption Hunt below for the one real edge case this heuristic cannot distinguish.
- **Termination evidence**: same permanent per-load scan pattern as #1.

### 3. `fixMiscategorizedIngredients()` (`db/ingredients.ts:163`)
- **Trigger**: gated by `settings.miscategoryFixed` AND `settings.categoryFixRulesVersion < CATEGORY_FIX_RULES_VERSION` (currently **v8** in `App.tsx`) — genuinely re-armable, not a one-shot flag; confirmed this is the only one of the four named mechanisms with an explicit version gate.
- **Scope**: every ingredient (incl. archived). Two independent mechanisms: (a) `CATEGORY_NAME_OVERRIDES` (~500 exact-name, case-insensitive matches, applied **unconditionally regardless of current category**, by design — confirmed via `categoryRules.ts`'s own comment, this bypasses the category gate deliberately since these are human-reviewed, not guessed); (b) `suggestCategory()` keyword rules, applied only when the ingredient's *current* category is in `RECLASSIFIABLE_CATEGORIES` (9 catch-all-prone categories).
- **Safeguards**: category (b) path cannot touch an ingredient already sorted into a specific, non-catch-all category, even on a keyword hit. Category (a) path has no such guard, by explicit design, since it's a curated list.
- **Idempotence**: once matched and corrected, an ingredient no longer meets either mechanism's re-trigger condition (name won't re-match to a *different* override; category will usually no longer be in `RECLASSIFIABLE_CATEGORIES`) — genuinely idempotent.
- **Termination evidence**: strongest of the four — explicit version gate, flips `miscategoryFixed = true` after running, only re-arms on a deliberate version bump.

### 4. `migrateIngredientCategories()` (`db/settings.ts:137`)
- **Trigger**: every app load, unconditionally — no flag, comment states "safe to call on every app load."
- **Scope**: `settings.ingredientCategories` (merged with `DEFAULT_SETTINGS`'s 21-category list plus any custom categories) and every ingredient's `category` field via `CATEGORY_MIGRATION_MAP` (15 old→new name pairs, several of which map a name to itself).
- **Idempotence**: once an ingredient's category is one of the 21 new names not present as a `CATEGORY_MIGRATION_MAP` key mapping to something *different*, it's a no-op. Genuinely idempotent, same reasoning as #1/#2.
- **Termination evidence**: same permanent per-load scan pattern.

### 5. `archiveAndPrune()` (`db/groceryLists.ts:29`) — **not in Phase 0's named list, discovered during this pass**
- **Trigger**: every time a new grocery list is generated (`GroceryListPage.tsx`'s `handleGenerated()`, called from `GroceryGenerator`).
- **Scope**: all `groceryLists` records with `status: 'active'` (marked `'completed'`) plus all `status: 'completed'` records.
- **Data touched**: **permanently deletes every completed grocery list except the single most recently generated one** — `sorted.slice(1)` is hard-deleted via `db.delete()`, every time, with no confirmation prompt and no user-visible warning.
- **Safeguards**: none — this is a genuine, silent, unconfirmed bulk-delete path, structurally different from the four repair/migration functions above (which only ever *correct* data, never permanently discard it).
- **Idempotence**: trivially idempotent (nothing left to prune after the first run in a session), but idempotence isn't the relevant property here — the concern is that it runs on every single list generation, not once.
- **Cross-reference finding**: `MealPlannerApp_Reference.md` Section 9 describes "Shopping History: **a collapsible archive of past completed/archived lists**" (plural, implying multiple retained lists) — but the actual behavior caps retained history at exactly **1** list. See Categorized Findings.

### 6. `pruneOldEntries(maxDays)` (`db/macroLogs.ts:38`) — **not in Phase 0's named list, discovered during this pass**
- **Trigger**: **none** — confirmed via a repo-wide search that this function has zero callers anywhere in the application. It is fully implemented (computes a cutoff date from `maxDays` and deletes every `macroLogs` entry older than it) but dead code.
- **Consequence**: `settings.macroHistoryDays` (Settings → Nutrients, "macro-history retention window (30–365 days, default 90)") is used in exactly one place in the entire app — `GoalSetupModal.tsx`, purely as a *lookback* window to fetch recent weight logs for the TDEE staleness check. It does not gate any deletion anywhere. Macro log entries are never automatically pruned by age; they accumulate in IndexedDB indefinitely regardless of the configured "retention" number. See Categorized Findings.

---

## Stale-Assumption Hunt

Recorded as observations, per the task's instruction, not as conclusions.

- **Sodium ×1000 heuristic (`repairSodiumUnitBug()`) assumes no legitimate ingredient will ever report sodium >5000mg per serving that also happens to be an exact multiple of 1000** (e.g. a genuine 6000mg, 7000mg, 8000mg reading — plausible for a large-format bouillon/soup-base concentrate or a family-size prepared meal). This assumption was reasonable when written against the specific historical bug it targets, but it runs unconditionally on every load forever with no allowlist — if a future import path (a new format, a manual high-precision entry) ever legitimately produces such a value, it would be silently divided by 1000 with no warning beyond a console log. Not confirmed to have happened; flagged as a plausible concern to verify against current data (specifically: does any current ingredient variant have `sodium > 5000 && sodium % 1000 === 0` that is *not* the already-known bug pattern?).
- **`findIngredientMatch()`'s `fuzzy` option defaults to `true`** (`options.fuzzy === false` is the only opt-out) despite two independently-documented false-positive incidents from fuzzy matching in this exact function's lineage (the branded-pack seeding false-positive and the 2026-07-24 JSON Import false-positive, both fixed by passing `{ fuzzy: false }` at the call site, not by changing the default). A fresh repo-wide search confirms the comment's claim still holds — exactly two callers exist today (`brandedLibrary.ts`, `JsonImportTab.tsx`), and both still pass `{ fuzzy: false }`. No current bug. But the default itself remains an opt-out design rather than opt-in, meaning any future third caller that omits the option would silently inherit the same fuzzy-matching behavior already proven twice to produce a high false-positive rate on this app's data. Worth a design-level look in whichever phase covers import pipelines.
- **`CATEGORY_NAME_OVERRIDES` is an exact-string snapshot** built from one household's backup export reviewed at one point in time (per its own comment, ~500 entries "come from a full manual, judgment-based line-by-line review of a real household's ~5000-ingredient backup export"). Any ingredient added later with different exact-name phrasing than what was reviewed silently bypasses this list and falls through to the keyword rules (or is left alone if not in `RECLASSIFIABLE_CATEGORIES`). This is inherent to an exact-match override list, not a bug, but it means the override list's coverage will not keep pace with new/renamed ingredients without a deliberate future refresh.
- **The barcode-format assumption (exactly 12 or 13 digits, `isValidBarcodeChecksum()`) is already a known, deliberately-accepted limitation** — not a new finding, but confirmed still accurate and consciously accepted (PLU/4-5-digit codes were explicitly decided against in `OPEN_ITEMS.md`'s 2026-07-30 PLU investigation) rather than a silently-unexamined assumption. Included here to show it was checked, not overlooked.
- **The IndexedDB schema-upgrade pattern** (`if (!db.objectStoreNames.contains(name)) { create + add indexes }` in `schema.ts`) would silently fail to add a **new index to an already-existing store** in a future version bump, since the guard is store-existence, not index-existence. Checked against the current schema history (stores V1 through V5): every index currently in the schema was defined at the same version the store itself was created, so this has not yet caused a problem — but the pattern itself is a latent risk for whoever next adds an index to an existing store rather than a brand-new one.
- **`getPlannedDayCount()`/`mealPlanDays` accumulate one record per calendar date ever touched, forever** — `deleteMealPlanDay()` exists but is never called (see Write-Path Audit). An emptied day (via "Clear day's meals") is never removed, only overwritten with an all-blank record. This is a growth/resilience observation more than a correctness one, noted here because it's the direct mechanical cause of the Phase 0 baseline discrepancy below.
- **`loadSettings()`'s merge-over-defaults (`{ ...DEFAULT_SETTINGS, ...stored }`) is itself a silent, permanent, unversioned migration mechanism** for every new `AppSettings` field ever added — it works correctly today (confirmed by reading it), but like the App-load repair functions above, it depends on every future new field being safe to default-fill this way; a future field that needs a *computed* default (not a static one) would not be handled by this pattern and could require its own explicit one-time migration, the same category of gap this project has hit before (category migration, casing migration).

---

## Baseline-Discrepancy Analysis

### 10 stored meal-plan-day records vs. 2 "planned" days
**Fully explained mechanically — not a bug.** `getPlannedDayCount()` (`db/mealPlan.ts:52`) deliberately filters to days where `Object.values(d.meals).some(slot => slot.length > 0)` — i.e., only days with at least one actual meal assigned. `saveMealPlanDay()` persists a record any time a day is touched at all, including:
- `DayDetail.tsx`'s "Clear day's meals" action, which explicitly calls `onUpdate({ date, meals: blankDayMeals() })` — an all-empty record that still gets saved.
- `handleApplyTemplate()`/`handleCopyWeek()` (`MealPlannerPage.tsx`), which write a `MealPlanDay` for every date in range regardless of whether the source day had any meals.

Since `deleteMealPlanDay()` has no callers, an emptied day's record is never removed, only left as a persisted, all-blank row. 10 stored records with only 2 containing an actual meal is consistent with this household having interacted with (and in some cases cleared) 8 more days than currently have something planned. No data loss, no miscount — the two numbers are answering genuinely different questions ("how many day records exist" vs. "how many days have a meal in them"), and the app's own UI only ever surfaces the second number.

### Ingredient and recipe count history
No new discrepancy found beyond what `OPEN_ITEMS.md` already documents and Phase 0 already flagged (the 6,246→6,252 post-reconciliation drift from a live Cloud Sync surfacing 6 pre-existing duplicate-review items, and the 22↔23 recipe-count incident, both already reconciled with a mechanical explanation on record). Nothing examined in this pass contradicts those reconciliations.

### Other internally-inconsistent observations found during this pass
- The `archiveAndPrune()` / "Shopping History" documentation mismatch (Section 9 says "past completed/archived list**s**," plural; actual retained count is 1) — see Categorized Findings.
- `macroHistoryDays`'s "retention window" framing vs. `pruneOldEntries()` being dead code — see Categorized Findings.

---

## Categorized Findings

**Confirmed integrity issue / confirmed discrepancy**
1. `pruneOldEntries()` (`db/macroLogs.ts`) is dead code — zero callers anywhere in the app. `settings.macroHistoryDays`'s UI label ("macro-history retention window") implies age-based deletion that does not actually happen; the setting only governs a lookback window in `GoalSetupModal.tsx`. Macro logs (device-local only) grow unboundedly.
2. `archiveAndPrune()`'s actual behavior (retain exactly 1 completed grocery list, silently deleting the rest on every new list generation) does not match `MealPlannerApp_Reference.md` Section 9's description of Shopping History as "a collapsible archive of past completed/archived lists" (plural).
3. `deleteMealPlanDay()` is dead code — zero callers. Cleared/emptied meal-plan days are never removed, only overwritten with a blank record, so `mealPlanDays` grows by one record per calendar date ever touched, indefinitely.

**Plausible integrity concern requiring verification**
4. `repairSodiumUnitBug()`'s heuristic (`sodium > 5000 && sodium % 1000 === 0`) has no allowlist and could silently mis-correct a genuinely high, round-number sodium value from a future import if one is ever introduced. Recommend checking whether any current ingredient variant matches this pattern for a reason other than the known historical bug.
5. `findIngredientMatch()`'s fuzzy-matching default is opt-out (`true` unless explicitly disabled) despite two prior documented false-positive incidents being fixed only by disabling it at each call site, not by changing the default. No current bug (both callers correctly opt out), but a footgun for any future caller.

**Explained / non-issue**
6. The 10-stored-vs-2-planned meal-plan-day discrepancy (fully explained above).
7. The barcode 12/13-digit-only assumption (already a known, deliberately-accepted limitation, re-confirmed accurate).
8. `CATEGORY_NAME_OVERRIDES`'s exact-name-snapshot nature (expected behavior for this kind of list, not a defect).
9. The IndexedDB schema-upgrade guard pattern (currently safe — no existing store has ever had an index added after its own creation version — but noted as a latent risk for future schema changes, not a present defect).

**Previously known and already resolved**
10. `mergeIngredients()`, `applyReceiptSaveBatch()`, `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()`, `repointIngredientReferences()`/`repointRecipeReferences()` — all re-verified as still atomic and correctly implemented on re-read; no regression found.
11. The `variant.barcode` unvalidated-write-path bug, the ingredient/recipe count drift history, and the Dill Pickle/Great Value data-cleanup items — all re-confirmed via `OPEN_ITEMS.md` as already resolved; nothing in this pass reopens them.

**Requires later-phase investigation**
12. Whether `archiveAndPrune()`'s 1-list retention is an intentional product decision that the reference doc simply describes imprecisely, or a genuine product gap (multiple shopping-history entries were intended) — a product-decision question, not a pure data-integrity one, but flagged here since it was found during this pass.
13. Whether macro log data should ever be pruned at all given it's device-local and personal (per Section 11, deliberately never synced) — `pruneOldEntries()` existing-but-unused suggests pruning was once intended; worth a decision either to wire it in or remove the dead code and the misleading "retention window" framing.

---

## Recommended Follow-Up Targets for Later Phases

- **Phase 6/7 (documentation)**: reconcile `MealPlannerApp_Reference.md` Section 9's "Shopping History" wording against `archiveAndPrune()`'s actual 1-list retention (finding #2), and Section 11's Phase-3 status already flagged in `AUDIT_PHASE0_BASELINE.md` §3d.
- **Whichever phase covers dead code / cleanup**: `pruneOldEntries()` and `deleteMealPlanDay()` (findings #1, #3) — decide whether to wire each in or remove it.
- **Data integrity spot-check** (could be closed out within this phase's remit on a future pass, or handed to whoever next touches ingredient repair logic): confirm no current ingredient legitimately trips the sodium ×1000 heuristic (finding #4).
- **Import-pipeline phase**: consider flipping `findIngredientMatch()`'s `fuzzy` default to opt-in given its false-positive history (finding #5).

---

*End of Phase 1. No fixes were implemented. No production data was modified. `OPEN_ITEMS.md` was not edited. Phase 2 has not been started.*
