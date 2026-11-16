# Full-Application Audit — Phase 2: Data Movement

**Completed: 2026-08-01.** Scope: imports, exports, Cloud Sync, household sharing, sync behavior, backup/restore, Family Share, household operations, receipt-based creation flows. Gemini integration quality, security/RLS internals, onboarding, UX consistency, documentation drift, and performance were out of scope except where directly required to answer a data-movement question. `AUDIT_PHASE0_BASELINE.md` and `AUDIT_PHASE1_DATA_INTEGRITY.md` were read in full and used as required inputs; Phase 1's own findings (dead `pruneOldEntries()`, the `archiveAndPrune()` retention/documentation mismatch, dead `deleteMealPlanDay()`, the sodium-heuristic and fuzzy-match-default concerns) are referenced below where directly relevant, not re-investigated. Investigation-only pass — no code changed, no production data modified, `OPEN_ITEMS.md` not touched, Phase 3 not started.

## Methodology

Re-read every data-movement code path fresh from the current repository state rather than trusting prior-session summaries — per Phase 1's own established discipline that "previously fixed" is not "permanently safe." This mattered concretely: the sync engine (`src/db/supabase.ts`, 1458 lines) has the highest documented bug history in this project (Operation Feedback & Trust, the `resolveIngredientDuplicate()`/`mergeIngredients()` reference-integrity gaps, the household_code casing saga), so its core functions (`fetchCloudRows`, `upsertCloudRow`, `deleteCloudRow`, `syncStore`, `syncIngredients`, `syncRecipes`, `syncMealPlans`/`syncGroceryLists`/`syncHouseholdItems`/`syncCollections`/`syncReferences`, `syncSettings`, `runSync`, `runFamilyShareSync`, `resolveIngredientDuplicate`, `resolveRecipeDuplicate`) were read in full, not sampled. Backup export/import (`DataSection.tsx`) and one representative general-import pathway (JSON Import) and one representative AI-assisted pathway (Receipt Scanner's `validateLine()`/save gate) were read in full for fidelity review. Household create/join/member-management (`db/auth.ts`, `AccountSection.tsx`) were re-confirmed against this same session's own earlier household_code fix work rather than re-read as if unfamiliar, since that work happened earlier in this same conversation and is already fresh, not a stale citation.

---

## Data-Movement Pathway Inventory

| Pathway | Lives in | Trigger | Data touched | Validation / error-handling |
|---|---|---|---|---|
| Barcode Lookup | `IngredientImport/BarcodeTab.tsx` → `ReviewScreen.tsx` | Manual barcode entry/scan | `ingredients` | Local DB → OFF → optional Gemini fallback; nothing saves until `ReviewScreen`'s explicit save |
| USDA Lookup | `USDATab.tsx` → `ReviewScreen.tsx` | Manual name search | `ingredients` | No AI; explicit save via `ReviewScreen` |
| Gemini Lookup | `GeminiTab.tsx` → `ReviewScreen.tsx` | Manual name/brand search | `ingredients` | Explicit save via `ReviewScreen` |
| Scan Label | `ScanLabelTab.tsx` → `ReviewScreen.tsx` | Photo capture | `ingredients` | Low-confidence fields flagged for manual review before save |
| Receipt Scanner | `ReceiptScannerTab.tsx` → `ReceiptLineReview.tsx` → `applyReceiptSaveBatch()` | Photo capture | `ingredients`, `householdItems`, `processedReceipts` | Per-line `validateLine()` blocks Save All on any unsaved line with an error; atomic 3-store transaction on save (Phase 1-adjacent, already verified) |
| JSON Import | `JsonImportTab.tsx` | File upload/drag-drop | `ingredients` | `extractRawIngredients()` + `normalizeIngredient()` reject shape-invalid rows; no cross-item transaction (deliberate, see below); dedup-safe retry |
| Bulk Entry | `BulkEntryTab.tsx` | Manual multi-row form | `ingredients` | Row-level validation gates Save All (per `OPEN_ITEMS.md`'s already-documented blank-row-validation fix) |
| Branded/Generic starter packs | `db/starterLibrary.ts`, `db/brandedLibrary.ts` | Onboarding prompt / Settings, versioned | `ingredients` | `findIngredientMatch(..., { fuzzy: false })` dedup, versioned re-seed gates (`starterLibraryVersion`, `brandedLibrarySeeded`) |
| Settings → Data → Export | `DataSection.tsx` `exportData()` | Manual button (Ingredients/Cookbook/Full scope) | Reads `ingredients`, `recipes`, and — Full scope only — `settings`, `mealPlanDays`, `mealPlanTemplates`, `macroLogs`, `groceryLists`, `householdItems` | None (pure read + JSON serialize) |
| Settings → Data → Import (backup restore) | `DataSection.tsx` `importData()`/`executeImport()` | Manual file upload | `ingredients`, `recipes`, `mealPlanDays`, `mealPlanTemplates`, `macroLogs`, `groceryLists`, `householdItems` — **not `settings`, see Findings** | `isNativeBackupFormat()` pre-check; conflict pre-count; atomic 7-store transaction (already Phase-1-verified) |
| Export Cookbook + Ingredients (bulk linking) | Not found | — | — | Confirmed still not implemented — matches `OPEN_ITEMS.md`'s existing `[ ]` open item; no new mechanism found |
| Cloud Sync — push/pull/both | `db/supabase.ts` `runSync()` → per-store `syncX()` functions | Manual button, per store type | All 8 synced stores + a curated settings subset | Per-store try/catch (partial-failure-tolerant by design); duplicate-name detection before every push and pull |
| Cloud Sync — Keep Mine / Keep Theirs / Keep Both | `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()` (`db/supabase.ts`) | Manual resolution of a flagged `SyncDuplicate` | `ingredients`/`recipes` + all their reference types | Atomic local transaction (already Phase-1-adjacent verified); cloud-side write is a necessarily separate step (platform constraint) |
| Family Share — push/pull/both | `runFamilyShareSync()` (`db/supabase.ts`) | Manual button, `CloudSyncSection.tsx` | `recipes` + `ingredients` (cost/store stripped via `stripCostData()`) only | Readonly-role gate — see Findings for a scope caveat |
| Household — create | `createHousehold()` (`db/auth.ts`) via `AccountSection.tsx` | Manual "Create a Household" | `households`/`household_members` (Supabase) | RPC returns no id (confirmed, not assumed — re-verified from this session's own earlier work) |
| Household — join by code | `joinHouseholdByCode()` (`db/auth.ts`) via `AccountSection.tsx` | Manual "Join by Code" | `households`/`household_members` | RPC returns `out_household_id`, surfaced as `householdId` (this session's own earlier fix, re-confirmed present) |
| Household — member role change / remove | `updateMemberRole()`/`removeMember()` (`db/auth.ts`) via `AccountSection.tsx`'s `HouseholdCard` | Owner-only UI action | `household_members` | See Findings — no visible self-removal safeguard |
| Household — leave (self-service) | Not found as a distinct flow | — | — | A member cannot remove themselves through any UI path found; only an owner's "Remove" action reaches any member row, including — per the code — the owner's own |

No additional data-movement pathway (beyond this list and Phase 0's inventory) was discovered.

---

## End-to-End Mapping — Notable Transformation/Loss/Duplication Points

- **JSON Import / starter packs**: raw JSON → `normalizeIngredient()`/`normalizeVariant()` (shape coercion, defensive defaults: `category: raw.category || 'Baking & Pantry'`, `servingSize: rv.servingSize ?? 100`, `pickMacro()`'s nested-vs-flat macro reconciliation) → `findIngredientMatch(..., {fuzzy:false})` dedup → `saveIngredient()`, one row at a time, no cross-row transaction. A malformed row (missing `name`/`variants`) is dropped cleanly via `normalizeIngredient()` returning `null`. A row with a *present but wrong-typed* numeric field (e.g. a macro value that's a string, or `NaN`) is **not** rejected — see Findings.
- **Receipt Scanner**: photo → Gemini extraction → `receiptMatching.ts`'s barcode-first/name-fallback tiering (already Phase-1-adjacent territory, not re-litigated here) → `ReceiptLineReview.tsx`'s per-line editable draft → `validateLine()` gate → `applyReceiptSaveBatch()` (atomic, 3 stores). No point in this chain writes to the database before the atomic batch — confirmed by re-reading `ReceiptLineReview.tsx`'s save path, matching the already-documented "staged/atomic approval workflow."
- **Backup export → import round trip**: `exportData('full')` explicitly captures `settings` into the JSON payload (`data.settings = settingsData`). **`executeImport()` never reads `data.settings` at all** — its store list is exactly `['ingredients', 'recipes', 'mealPlanDays', 'mealPlanTemplates', 'macroLogs', 'groceryLists', 'householdItems']`, with no settings branch anywhere in the function. This is a genuine, code-confirmed round-trip fidelity gap — see Findings.
- **Cloud Sync push/pull**: local record → (Family Share only) `stripCostData()` → `upsertCloudRow()`/pulled `CloudRow.data` → `saveIngredient()`/`saveRecipe()`/etc., one row at a time, **not** wrapped in a shared IndexedDB transaction across rows (see Sync-Specific Scrutiny — this is a deliberate, reasoned design difference from Phase 1's transactional writes, not an oversight).
- **Duplicate resolution (Keep Mine/Theirs/Both)**: local IndexedDB transaction (atomic) → separate, non-transactional cloud upsert/delete step for "keep-local" only, a genuine platform constraint (a browser IndexedDB transaction cannot span a network call) reasoned through explicitly in the code's own comments and re-verified correct here (see Sync-Specific Scrutiny).

---

## Sync-Specific Scrutiny

**Partial/interrupted sync**: `runSync()` wraps each of the 8 sync units (ingredients, recipes, collections, references, meal plans, grocery lists, household items, settings) in its own independent `try/catch`, accumulating results into one `SyncSummary` and continuing to the next store regardless of an earlier failure. Confirmed via a fresh full read — this is unchanged from what `OPEN_ITEMS.md`/`MealPlannerApp_Reference.md` already document, and `CloudSyncSection.tsx`'s `buildSyncErrorMessage()` correctly surfaces "X items synced successfully despite this... you can retry — already-synced items won't be duplicated" rather than implying total failure. Re-verified, not assumed.

**Atomicity shape — genuinely different from Phase 1's transactional pattern, and this is reasoned, not accidental**: within a single store's sync (e.g. `syncIngredients()`), each record is pushed/pulled and saved individually — `upsertCloudRow()` per item, `saveIngredient()` per item — with no `db.transaction([...], 'readwrite')` spanning the whole store's sync, let alone all 8 stores. This initially looks like it should be flagged the same way Phase 1 flagged non-atomic writes, but the failure mode is fundamentally different: every individual record written is a complete, independently valid entity (never a partial multi-field write split across records the way `mergeIngredients()`'s repointing was), and the newest-timestamp-wins merge logic makes a re-run after any interruption naturally idempotent and self-correcting rather than requiring a rollback. This is a deliberate, defensible design given sync's specific retry/resume model — classified as Explained/non-issue below, not a defect.

**`SYNCED_SETTINGS_KEYS` boundary — re-verified field-by-field against the full current `AppSettings` shape**, not assumed unchanged. Confirmed correct: `theme`, `fontSizePt`, all API keys (`geminiApiKey`, `usdaApiKey`, `ai.apiKey`), `lastGeminiResolution`, `starterLibrarySeeded`/`starterLibraryVersion`/`brandedLibrarySeeded` (explicitly commented as intentionally device-local — "a decision on one device says nothing about whether a different device has ever been asked"), `miscategoryFixed`/`categoryFixRulesVersion`, all Cloud Sync credentials themselves, `lastHouseholdSyncAt`/`lastFamilySyncAt`, and `cloudSyncPromptDismissed` are all correctly excluded, each with an explicit rationale comment except where the exclusion is self-evident (credentials, API keys). **One field has no such rationale**: `kitchenReferencePhotoPolicy` is excluded from `SYNCED_SETTINGS_KEYS` with zero comment explaining why, unlike every other excluded field — see Findings.

**Family Share's exact current scope, re-confirmed rather than assumed**: `runFamilyShareSync()` calls exactly `syncRecipes()` and `syncIngredients(..., familyShare=true)` — nothing else. This matches `MealPlannerApp_Reference.md` Section 11 exactly ("syncs only recipes and ingredients, cost fields stripped"). No drift found. **One caveat found on this re-read**: the readonly-role guard (`if (settings.familyShareRole === 'readonly' && direction === 'push') { ...return... }`) only checks for the literal string `'push'`, not the `direction !== 'pull'` idiom used everywhere else in this same file for "does this operation include a push" (`syncStore`, `syncIngredients`, `syncRecipes`, `syncSettings` all use `direction !== 'pull'`). A `direction: 'both'` call would fall through this guard and proceed to push. This is **not reachable through the shipped UI** — `CloudSyncSection.tsx`'s "↕ Sync Family Share" button (which passes `'both'`) is independently disabled via `settings.familyShareRole === 'readonly'` in its own `disabled` prop, confirmed by re-reading that component. But the function itself does not independently enforce what the reference doc describes as being "enforced before any network call for readonly" — see Findings.

---

## Import/Export Data-Fidelity Review

- **JSON Import / starter packs**: malformed *shape* (missing name, missing/empty variants array) is cleanly rejected — `normalizeIngredient()` returns `null`, filtered out, and an aggregate "No valid ingredients were found" error shown if everything was rejected. **Not validated**: numeric field *type/range* — a macro field present but wrong-typed (a string, `NaN`, a negative number) passes through `pickMacro()`'s `!= null`/`!== 0` checks (which don't runtime-check `typeof`) and would be stored as-is. No corruption was demonstrated in this pass (that would require constructing a live test file, which is verification work, not audit work per the task's own instruction) — flagged as a plausible concern, not a confirmed defect.
- **Bulk Entry / Receipt Scanner**: row/line-level validation gates Save All before any write; already covered by existing documented fixes (Bulk Entry's blank-row validation) and this pass's own re-read of `validateLine()`. No new gap found.
- **Backup export → import round trip**: **confirmed NOT fully faithful.** A "Full" export captures `settings` (household name, person profiles, custom ingredient categories/brands/stores, recipe tags, nutrient toggles, allergen watch list, unit system, etc.) in the JSON payload, but `executeImport()` has no code path that ever reads or writes `data.settings` — it is silently dropped on restore. Re-importing a full backup into a reset/fresh household would correctly restore all 7 content stores but would leave settings at whatever they already were (or `DEFAULT_SETTINGS`, if freshly reset), not what was actually backed up. Ingredients/recipes/collections/references/etc. round-trip correctly — this is specifically and only a `settings` gap.

---

## Household-Sharing Boundary Review

Re-verified against current code rather than assumed unchanged, given this exact boundary was the subject of extensive prior work this session (household_code casing fix):

- **Cloud Sync (Household Sync Code)**: all 8 data tables + curated settings subset, scoped by `household_code` via the now-`.ilike()`-based `fetchCloudRows()`/`deleteCloudRow()` (re-confirmed present in the current file, not reverted). Matches documentation.
- **Family Share**: recipes + cost-stripped ingredients only, under a `<code>:family` partition (confirmed via `runFamilyShareSync()`'s literal `` `${shareCode}:family` `` construction, re-read fresh). Matches documentation exactly, including the owner/contributor/readonly role model — with the one push-guard scope caveat noted above.
- **Household create/join/member management**: re-confirmed consistent with this session's own earlier work — `createHousehold()` returns no id, `joinHouseholdByCode()` returns `out_household_id`, `AccountSection.tsx`'s member list shows role-management controls (`Select` + `Remove`) gated on `household.role === 'owner'` for **every row in the list**, including the signed-in owner's own row. No distinct "leave household" self-service action exists for a non-owner member — a non-owner sees only a static role tag, no way to remove themselves. **No visible code-level safeguard prevents an owner from using "Remove" on their own row**, which would leave the household's ownership state to whatever the RLS/database layer does with a memberless-of-owners household (not investigated here — a security/RLS question, out of this phase's scope, flagged for later reference only).

---

## Categorized Findings

**Confirmed integrity/behavior issue**
1. **Backup restore silently drops `settings`.** `exportData('full')` includes `settings` in the export payload; `executeImport()` has no code path that reads or writes it. A restored "full" backup never brings back household name, person profiles, custom categories/brands/stores/recipe tags, nutrient toggles, or the allergen watch list.
2. **`runFamilyShareSync()`'s readonly-push guard doesn't match its own file's established idiom.** It checks `direction === 'push'` rather than `direction !== 'pull'` (used everywhere else in `db/supabase.ts` for the same purpose), meaning a `direction: 'both'` call bypasses the guard at the function level. Not currently reachable through the shipped UI (the combined-sync button is independently disabled for readonly members in `CloudSyncSection.tsx`), but the function's own enforcement doesn't match what `MealPlannerApp_Reference.md` describes ("enforced before any network call for readonly").
3. **`kitchenReferencePhotoPolicy` is excluded from `SYNCED_SETTINGS_KEYS` with no documented rationale**, unlike every other excluded settings field.

**Plausible concern requiring verification**
4. JSON Import / backup restore validate shape but not numeric value type/range for macro fields — a shape-valid-but-wrong-typed value would be silently stored uncorrected. Not demonstrated live in this pass (would require constructing a test file — verification work, not audit work).
5. No visible safeguard prevents a household's sole owner from removing their own membership via "Manage members," a household-operations question distinct from the RLS enforcement question this phase deliberately did not investigate.

**Explained/non-issue**
6. Sync's per-record (not per-store-transaction) write shape initially resembles the non-atomic patterns Phase 1 flagged elsewhere, but is a deliberate, reasoned design appropriate to sync's idempotent, resumable retry model — not a defect.
7. `runSync()`'s per-store try/catch, continuing past a failed store rather than aborting — a deliberate resilience design, correctly surfaced to the user via `summary.errors`/`buildSyncErrorMessage()`.
8. `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()`'s "keep-local" cloud-side-failure scenario (local transaction commits; cloud upsert/delete fails independently, a genuine platform constraint) — traced through fully: results in the same duplicate being correctly re-flagged on the next sync, not silent loss.
9. Family Share's exact scope (recipes + cost-stripped ingredients only) — re-verified unchanged from documentation.
10. JSON Import's/starter-packs' malformed-shape handling (`normalizeIngredient()` returning `null`) and Receipt Scanner's/Bulk Entry's row-level validation gates — both cleanly reject incomplete input rather than silently corrupting it.

**Previously known and already resolved (re-verified on fresh read, no regression found)**
11. `mergeIngredients()`, `applyReceiptSaveBatch()`, `executeImport()`, `performReset()` atomicity — all still correctly implemented exactly as documented.
12. `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()` reference-integrity + local-transaction atomicity fixes — still correct.
13. household_code casing fix (`.ilike()` + `escapeIlikeValue()` in `fetchCloudRows()`/`deleteCloudRow()`) — still present and correctly applied.
14. `fetchCloudRows()`'s pagination past PostgREST's 1000-row default limit — still present, still correct.
15. "Export Cookbook + Ingredients for bulk recipe-ingredient linking" — confirmed still not implemented; no new mechanism found that would close this already-open `OPEN_ITEMS.md` item.

**Requires later-phase investigation**
16. Whether finding #3 (`kitchenReferencePhotoPolicy` sync exclusion) is an intentional product decision that simply lacks a comment, or a genuine oversight that should sync as household policy (similar to `nutrientToggles`/`ingredientDisplay`).
17. Whether/how to close finding #1 (settings round-trip gap) — including what conflict-resolution behavior restoring settings into a household with different current settings should have.
18. Whether finding #2's guard should be hardened to `direction !== 'pull'` for defense-in-depth, independent of whatever RLS-level enforcement exists server-side (not investigated here, per scope).
19. Whether an owner-self-removal safeguard (finding #5) is needed, and what the correct behavior should be if a household's last owner is removed.

---

## Recommended Follow-Up Targets for Later Phases

- **Whichever phase covers backup/restore correctness**: close or explicitly document the settings round-trip gap (finding #1).
- **Whichever phase covers Family Share / security boundary hardening**: the push-guard idiom mismatch (finding #2) and the settings-sync-exclusion documentation gap (finding #3).
- **A future data-integrity or import-hardening pass**: numeric value validation on ingredient import (finding #4), building on Phase 1's own fuzzy-match-default footgun finding in the same import pipeline.
- **Household operations / account-management phase**: the owner-self-removal safeguard question (finding #5).

---

*End of Phase 2. No fixes were implemented. No production data was modified. `OPEN_ITEMS.md` was not edited. Phase 3 has not been started.*
