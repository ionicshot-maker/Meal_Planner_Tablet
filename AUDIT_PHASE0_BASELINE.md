# Full-Application Audit — Phase 0: Inventory & Baseline

**Captured: 2026-08-01.** This is a point-in-time snapshot, not a target the app is expected to hold still against — ingredient/recipe/household counts, and possibly the feature list itself, will continue to change with ordinary use. Phases 1–7 read from this document; only later audit phases should update it (e.g. appending a superseding baseline), not casual edits.

This document is inventory only. It does not identify bugs, gaps, or risks, and does not rank anything by priority — that is explicitly every subsequent phase's job (see the parent audit task for Phase 0's scope boundaries).

---

## 1. Live Baseline Counts & Key Metrics

Captured via a fresh direct read of the real household's IndexedDB (`MealPlannerDB`) and its Settings → Data → Cloud Sync UI, not cited from any prior session's reported number.

| Metric | Value | Source |
|---|---|---|
| Ingredients | **6,252** | Direct IndexedDB count, `ingredients` store |
| Recipes | **23** | Direct IndexedDB count, `recipes` store |
| Collections | 2 | Direct IndexedDB count, `collections` store |
| Kitchen References | 2 | Direct IndexedDB count, `references` store |
| Grocery Lists | 7 | Direct IndexedDB count, `groceryLists` store |
| Household Items | 1 | Direct IndexedDB count, `householdItems` store |
| Macro Log entries | 0 | Direct IndexedDB count, `macroLogs` store (device-local, never synced) |
| Meal Plan Days (stored records) | 10 | Direct IndexedDB count, `mealPlanDays` store |
| Meal Plan Days ("planned") | 2 | As displayed by the app's own Settings → Data summary line — differs from the raw store count above; the app's own `getPlannedDayCount()` evidently applies a narrower definition (e.g. "has at least one meal") than a raw record count. Noted as an observed discrepancy only — not characterized as a bug, per Phase 0 scope. |
| Meal Plan Templates | 0 | Direct IndexedDB count, `mealPlanTemplates` store |
| Processed Receipts | 2 | Direct IndexedDB count, `processedReceipts` store |
| Households (cloud) | 1 ("Angelo Family", code `Angelo-Family-2026`) | Settings → Data → Cloud Sync → Account UI (no live Supabase dashboard/SQL access this session) |
| Household members | 1 (the owner, `ionicshot@gmail.com`) | Same UI, "Manage members" expanded |

### Other metrics with a documented cross-session drift history (per a fresh check of `OPEN_ITEMS.md`)

- **Ingredient count** — the well-known sequence `5,698 → 6,125 → 6,121 → 6,129 → 6,263 → 6,246`, closed 2026-08-01 as "current state confirmed, historical drift only partially explained" (see `OPEN_ITEMS.md`'s Data cleanup section). **Since that closure, the count moved again**: a live Cloud Sync run performed later the same day (as part of the household_code case-sensitivity fix's required live verification) pushed it from 6,246 → **6,252**, surfacing 6 pre-existing, unrelated duplicate-review items from real cross-device content drift — confirmed unrelated to that fix and deliberately left unresolved as a product decision. 6,252 is this document's fresh baseline; it is expected to keep moving with ordinary use, same as every prior number in the sequence.
- **Recipe count** — a smaller, separate drift: the tracked baseline moved from 23 → 22 (an accidental extra deletion during a 2026-07-29 cleanup pass, confirmed by the user as their own mistake, not a bug) → back to 23 (the deleted recipe, "Kansas Eyeballs (Samantha Goff)," was found to exist again in the live database during a 2026-07-29 reconciliation pass; the restore mechanism itself was never confirmed and remains unexplained). 23 has been the stable, independently reconfirmed baseline in every session since.
- No other metric (household/member count, collection count, grocery list count, etc.) has any documented cross-session drift history in `OPEN_ITEMS.md` — these are being tracked for the first time as part of this baseline.

---

## 2. Feature / Page / Workflow Inventory

Category legend: **A** Data Integrity & Correctness · **B** Data Movement · **C** AI/External Integrations · **D** App State & Configuration · **E** Security & Privacy · **F** User-Facing Quality · **G** Resilience. Multi-category rows are intentional, not a hedge.

### Routes (`src/App.tsx`)

| Workflow | File(s) | Purpose | Category |
|---|---|---|---|
| Ingredients | `pages/Ingredients/IngredientsPage.tsx`, `IngredientForm.tsx`, `MergeIngredientModal.tsx` | Ingredient database: browse/search/filter, create/edit/archive/delete, merge duplicates | A |
| Cookbook (Recipes) | `pages/Cookbook/CookbookPage.tsx`, `RecipeCard.tsx`, `RecipeDetail.tsx`, `RecipeEditor.tsx` | Recipe browsing (all/favorites/templates filters), creation, editing, detail view | A, F |
| Cookbook → Recipe Import | `RecipeImportModal.tsx` | Paste-text or photo-based recipe import via Gemini, including multi-recipe crop-another flow | C, B |
| Cookbook → Mini Ingredient Import | `MiniIngredientImportPanel.tsx` | Inline ingredient creation while editing a recipe, without leaving the editor | A, C |
| Cookbook → Ingredient Link | `IngredientLinkModal.tsx` | Links a recipe's free-text ingredient lines to real database ingredients/variants | A |
| Cookbook → Collections | `CollectionsTab.tsx`, `CollectionView.tsx`, `CollectionPDFExport.tsx` | Named, orderable recipe folders; PDF export (TOC, photos, nutrition, cost, matched reference pages) | A, F |
| Cookbook → Kitchen References | `ReferenceTab.tsx`, `ReferenceEditor.tsx`, `ReferenceDetail.tsx`, `ReferenceCard.tsx` | Kitchen reference pages (conversion charts etc.), including AI photo-scan import | A, C |
| Cookbook → Add to Meal Plan | `AddToMealPlanModal.tsx` | Assigns a recipe directly to a meal-plan slot from Cookbook | B, F |
| Meal Planner | `pages/MealPlanner/MealPlannerPage.tsx`, `CalendarGrid.tsx`, `MobileDayStrip.tsx` | Multi-week calendar (grid on wide screens, swipeable strip on mobile) | A, F |
| Meal Planner → Day Detail | `DayDetail.tsx` | Per-day meal slot editing (primary/sides/dessert, Leftover link, Shared vs. Individual), clear day | A, F |
| Meal Planner → Templates | `TemplateModal.tsx` | Save a planned week as a reusable named template; apply to any week | A |
| Meal Planner → Recipe Picker | `RecipePicker.tsx` | Filtered cookbook browse-and-pick for assigning a recipe to a slot | F |
| Meal Planner → Copy Week | (within `MealPlannerPage.tsx`) | Copies one week's plan onto another, replacing existing meals there | A |
| Macro Tracker | `pages/MacroTracker/MacroTrackerPage.tsx`, `DayLog.tsx`, `MealSection.tsx`, `MacroItemRow.tsx` | Per-person daily macro/calorie logging (Simple/Complex mode), up to 10 people | A, D |
| Macro Tracker → Goal Setup | `GoalSetupModal.tsx` | Goal setting (Individual Targets or Calorie+%); includes the TDEE/BMR "Calculate for me" suggestion | A, F |
| Macro Tracker → Manual Log | `ManualLogModal.tsx` | Fully manual meal/water/weight logging, no recipe required | A |
| Macro Tracker → Weekly Summary | `WeeklySummary.tsx` | 7-day summary modal: daily average, goal row, weight-log list | F |
| Grocery List | `pages/GroceryList/GroceryListPage.tsx`, `GroceryListView.tsx`, `GroceryItemRow.tsx` | Grocery list display, interactive check-off | B, F |
| Grocery List → Generator | `GroceryGenerator.tsx`, `MealPlanCalendarPicker.tsx` | Builds a grocery list from a selected meal-plan date range | B |
| Grocery List → Household Items | `HouseholdModal.tsx` | Non-grocery recurring household items list (e.g. "Trash Bags"), independent of meal planning | A |
| Settings → Household | `sections/HouseholdSection.tsx` | Household name/size, per-person profiles (demographics, Simple/Complex mode, Payday Schedule) | D |
| Settings → Preferences | (inline, `SettingsPage.tsx`) | Unit system, theme, text size, store-preference toggle, kitchen-reference-photo retention policy | D |
| Settings → Integrations | `sections/AISection.tsx` | AI provider config, Gemini key/model picker + live model discovery ("Check available models"/"Browse all models"), Supabase URL/Anon Key config | C, D |
| Settings → Nutrients | (inline, `SettingsPage.tsx`) | Optional-nutrient toggles, macro-history retention window | D |
| Settings → Ingredients | (inline, `SettingsPage.tsx`) | Nutriscore/Nova/allergen badge display toggles, Allergen Watch List | D, A |
| Settings → Lists | `sections/ListsSection.tsx` | Free-form management of ingredient categories, recipe tags, brands, stores; fuzzy-duplicate warnings | D, A |
| Settings → Data | `sections/DataSection.tsx` | Local counts summary, three-tier Backup Export, Backup Import (conflict handling), granular Reset | B, A |
| Settings → Data → Cloud Sync | `sections/CloudSyncSection.tsx` | Household Sync Code (push/pull/sync), Family Share code, setup-SQL helpers | B, E |
| Settings → Data → Cloud Sync → Account | `sections/AccountSection.tsx` | Supabase Auth sign-up/in/out, create/join household by code, owner-only member role management | E, B |
| Settings → Setup Checklist | `sections/SetupChecklist.tsx` | Persistent onboarding checklist shown atop every Settings tab | D |
| Import Ingredients → Barcode Lookup | `IngredientImport/BarcodeTab.tsx` | Local DB → Open Food Facts → optional Gemini-enrichment fallback | A, C |
| Import Ingredients → USDA Lookup | `USDATab.tsx` | Batch search by name against USDA data, no AI | A |
| Import Ingredients → Gemini Lookup | `GeminiTab.tsx` | AI-driven lookup by product name/brand | C |
| Import Ingredients → Scan Label | `ScanLabelTab.tsx` | Photograph a nutrition-facts panel; AI reads it, flags low-confidence fields | C |
| Import Ingredients → Receipt Scanner | `ReceiptScannerTab.tsx`, `ReceiptLineReview.tsx` | Photograph a receipt; per-line price/qty parsing + barcode-first/name-fallback matching, 3-way per-line choice, nutrition fallback chain | A, C, B |
| Import Ingredients → Bulk Entry | `BulkEntryTab.tsx` | Manual spreadsheet-style multi-row entry, no AI | A |
| Import Ingredients → JSON Import | `JsonImportTab.tsx` | This app's own export format or an OFF bulk-converter format; Add New Only / Add+Update / Replace modes | A, B |
| Import Ingredients → Review Screen | `ReviewScreen.tsx` | Shared save/review UI for Barcode/USDA/Gemini/Scan Label results | A |
| Help | `pages/Help/HelpPage.tsx` | Static in-app documentation/FAQ, deep-linkable TOC | F |
| Dev Tools | `pages/DevTools/DevToolsPage.tsx` | Owner-gated: Leading-Zero Barcode Duplicate Finder (scan, merge, delete) | A, E |

### App-level flows (not routes)

| Workflow | File(s) | Purpose | Category |
|---|---|---|---|
| Setup Wizard | `pages/Setup/SetupWizard.tsx` | Full-screen first-run flow, shown until `setupComplete` | D |
| Starter Library Prompt | `components/StarterLibraryPrompt.tsx` | One-time/versioned prompt to seed or update the starter ingredient/recipe library | D, A |
| Cloud Sync Prompt | `components/CloudSyncPrompt.tsx` | Dismissible reminder banner shown when signed out | D |
| Legacy ingredient data repair | `repairLegacyIngredientData()` (`db/ingredients.ts`, invoked in `App.tsx`) | One-time-per-record reshape of raw/non-app-shape ingredient data (e.g. from an unvalidated OFF JSON import) into the shape every screen expects | A, G |
| Sodium unit-bug repair | `repairSodiumUnitBug()` (`db/ingredients.ts`, invoked in `App.tsx`) | One-time-per-record repair for a since-fixed ×1000 sodium unit-detection bug in an earlier ingredient-converter script | A, G |
| Category migration & miscategorization fix | `migrateIngredientCategories()`, `fixMiscategorizedIngredients()` (versioned via `CATEGORY_FIX_RULES_VERSION`, currently v8) | 15→21 category one-time migration, plus a versioned, re-armable pass correcting ingredients auto-routed to the wrong category | A |
| Supabase keep-alive ping | `pingSupabaseKeepAlive()` (`db/supabase.ts`, invoked in `App.tsx`) | Once-per-23-hours no-op ping preventing the free-tier project from auto-pausing | G, B |

### Cross-cutting shared components (not standalone workflows, referenced for later phases' context)

`PhotoCaptureCrop.tsx` (shared photo capture/crop/AI-seeded box detection, used by Recipe Import, Receipt Scanner, Reference scan, Scan Label) · `BarcodeScanModal.tsx` (shared camera barcode scanning) · `BrandCombobox.tsx` (brand-field autocomplete, used across ingredient forms) · `QualityBadges.tsx` (Nutriscore/Nova display) · `AllergenChips.tsx` · `OperationStatus.tsx` (shared long-running-operation feedback, used by Cloud Sync, Backup Import, JSON Import, Bulk Entry, Starter Library) · `Modal.tsx` / `ConfirmDiscardDialog.tsx` (shared confirm/dialog primitives) · `ConversionCalculator.tsx` · `ErrorBoundary.tsx`.

---

## 3. Cross-Reference: `OPEN_ITEMS.md` & `MealPlannerApp_Reference.md`

Both files read in full for this pass.

### 3a. Already investigated, fixed, and live-verified this session (candidates for lighter-touch confirmation, not fresh ground-up investigation)

- household_code case-sensitivity gap (`fetchCloudRows()`/`deleteCloudRow()` → `.ilike()`, canonical-code self-correction) — RESOLVED 2026-08-01
- Ingredient count reconciliation (historical drift assessment) — RESOLVED 2026-08-01 (see §1's note on the subsequent 6,246→6,252 drift)
- Dill Pickle sodium correction (900mg → 290mg) — RESOLVED 2026-08-01
- Great Value brand-string cleanup (23 of ~30 records) — PARTIALLY RESOLVED 2026-08-01 (6-record cluster deferred, see §3b)
- Gemini model fallback-literal consolidation (all Netlify Functions + client) — RESOLVED 2026-08-01
- Dynamic Gemini Model Discovery, Phases 1–3 (curated chips + browse-all, both live-sourced) — RESOLVED 2026-07-30
- TDEE/BMR Calculator, all 4 phases (Macro Tracker) — RESOLVED 2026-07-30
- `variant.barcode` unvalidated-raw-text write-path fix (Receipt Scanner) — RESOLVED 2026-07-31
- PLU lookup for Receipt Scanner produce items — decided against, closed 2026-07-30
- `window.confirm()` → Modal migration, all 5 phases (6 confirmation sites across 5 files) — RESOLVED 2026-07-29
- Recipe Import Workflow Improvements Phase 1 (disk photo import — found already fully built) and Phase 2A (crop multiple recipes from one photo) — both live-verified
- Bulk Entry blank-row validation fix — fixed and live-verified
- Operation Feedback & Trust, all 3 phases (Cloud Sync, Backup Import, JSON Import, Bulk Entry, Starter Library) — RESOLVED 2026-07-25
- Receipt Scanner confidence-tier mislabeling fix (`findSmartMatches()`/`matchLine()`) — fixed 2026-07-25, not click-verified live (documented as such)
- Supabase RLS security audit + Phase 3 bridge-clause closure + casing-drift remediation — RESOLVED/COMPLETE 2026-07-25 (see §3d — this conflicts with `MealPlannerApp_Reference.md`'s own wording)
- Atomicity fixes: `mergeIngredients()`, `performReset()`, `applyReceiptSaveBatch()`, `resolveIngredientDuplicate()`/`resolveRecipeDuplicate()`, `executeImport()`, `mealPlanTemplates` reference-repointing gap — all fixed and at least logic-verified, most click-verified live
- Barcode comparison consolidation (one shared implementation app-wide) — fixed 2026-07-24
- ReviewScreen silent single-fuzzy-match auto-merge fix — fixed 2026-07-24
- JSON Import fuzzy-matching false-positive fix — fixed
- 6 leftover disposable test households + 18 test auth accounts — cleanup RESOLVED 2026-07-29
- Local `.claude/settings.local.json` service_role key exposure — scrubbed, RESOLVED 2026-07-28
- Bill due-date awareness (Macro Tracker-adjacent idea) — decided against, closed 2026-08-01

### 3b. Open / tracked, not yet acted on

| Item | Status |
|---|---|
| Migrate to Supabase's new decoupled API key system (`sb_secret_`/`sb_publishable_`) and deactivate legacy `service_role`/anon keys | Investigated (2026-07-28), not yet implemented. **Note for later phases**: a fresh verification this session found the real household's stored `supabaseAnonKey` is already in the new `sb_publishable_` format, not the legacy JWT shape — worth confirming with the user whether this migration is more advanced in practice than the tracked item currently reflects. |
| Case-insensitive `is_member_of_code()`/`is_writable_member_of_code()` (Option B) | Deferred by explicit decision — unsafe standalone without a matching case-insensitive uniqueness constraint on `households.code` |
| `join_household_by_code()` self-service, no rate limiting/owner-approval | Decided against changing (accept-as-is), with explicit revisit conditions recorded — closed, not open work |
| Export Cookbook + Ingredients for bulk recipe-ingredient linking | Not yet scoped (original pending list) |
| "Freshness Guaranteed / Marketside" 6-record brand cluster | Deferred follow-up from the Great Value cleanup — needs its own normalization decision |
| Future review item: Gemini Help & Documentation Refresh | Not investigated, not scoped |
| Future review item: Dynamic Gemini Discovery Aging Strategy | Not investigated, not scoped |
| Future review item: TDEE/BMR Estimate Freshness | Not investigated, not scoped |
| Future review item: Documentation & User Guidance Audit | Not investigated, not scoped (explicitly noted as the broader item the Gemini-docs item is a subset of) |

### 3c. Item-1 workflows not mentioned anywhere in either document

Stated as a neutral cross-reference finding only — no priority or risk judgment implied.

- **The three App.tsx-level background repair/migration effects** — `repairLegacyIngredientData()`, `repairSodiumUnitBug()`, and the versioned `fixMiscategorizedIngredients()`/category-migration pass. The 15→21 category migration itself is described generically in `MealPlannerApp_Reference.md` Section 4, but none of these three specific repair mechanisms are named or described as their own entries in either document.
- **`pingSupabaseKeepAlive()`** is described in prose in Section 11 ("a once-per-23-hours no-op keep-alive ping") but not tracked as its own item in `OPEN_ITEMS.md`.

Everything else in the §2 inventory — every route, every Settings tab, every Import Ingredients tab, every Cookbook/Meal Planner/Macro Tracker/Grocery List sub-flow — has at least a descriptive mention in `MealPlannerApp_Reference.md` (which is written as a complete feature reference), even where `OPEN_ITEMS.md` has never tracked an audit/bug/decision item against it.

### 3d. Documentation drift noted between the two files (factual observation, not a severity judgment)

`MealPlannerApp_Reference.md` Section 11 ("Outstanding security note," lines 415–417) and Section 13 ("Known Gaps," line 554) both currently state that Cloud Sync Phase 3 (closing the legacy `household_code` RLS bridge clause) is **not yet closed** / "deliberately deferred." `OPEN_ITEMS.md` documents Phase 3 as **COMPLETE, executed, and security-validated live on 2026-07-25**, with a disposable non-member test account confirming blocked cross-household access (403/RLS-violation on write, 0 rows on read). For Phase 0 purposes and for any later phase relying on "is this already audited," `OPEN_ITEMS.md`'s dated, verified resolution entry is the more current source on this specific point — the reference doc's wording here has not been updated to match.

---

*End of Phase 0 baseline. Do not begin Phase 1 work in this document — this file is a reference for Phases 1–7 to read from, not a running log to append findings to as they're made in those phases.*
