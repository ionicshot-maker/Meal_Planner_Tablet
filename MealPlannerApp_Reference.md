# Meal Planner App — Complete Reference

**Version 2.11 — 2026-07-24**

> **Format change note:** This document was originally `MealPlannerApp_Reference.docx` (Version 1.0, June 2026), written before most of the app was built, as a design-intent spec. That file was never kept in sync with the actual build — most notably, it still listed Cloud Sync as "intentionally left for later" even though real Cloud Sync (including full per-user authentication) has been live for a while. This Version 2.0 is a full rewrite from a code-verified audit of the actual app as it exists today, reorganized to match the original document's section structure. The original `.docx` is left untouched at the repo root for history; **this file is the one to keep current going forward.**

---

## Purpose of This Document

This reference document captures the actual, current design and implementation of the Meal Planner App — not just original intent. It should be consulted at the start of every build/planning session to confirm what's actually built, in progress, or still just an idea, and **updated whenever a significant feature, architectural decision, or design change lands** — bump the version and date at the top, and log the change in the Changelog (Section 14) when you do.

---

## 1. Platform & Tech Stack

| Item | Status |
|---|---|
| Framework | React + TypeScript, Vite-built Progressive Web App (PWA) |
| Runs on | Any modern browser (Chrome, Edge, Firefox) on Windows, phone, or tablet — no installation required |
| Android APK | Not built. Still a plausible later step (Capacitor around the same React codebase), but not started. |
| Storage | IndexedDB (`idb`) — all data lives on-device by default |
| Cloud | Optional Supabase Cloud Sync — see Section 11. Not required to use the app. |
| Export / Import | JSON, three tiers: Ingredients only / Cookbook only (recipes + collections + kitchen references) / Full backup. Import handles ID-conflict Skip vs. Overwrite. |
| USDA API | FoodData Central (free) — auto-fills macros for raw ingredients. Optional key; falls back to a shared public demo key if blank. |
| AI Provider | Pluggable — Anthropic Claude, Google Gemini, OpenAI, or Ollama (fully local/free, runs on the user's own machine). A **separate** Google Gemini key/field also exists specifically for nutrition/photo-scan features (see Section 10) — these are two independent settings, not the same key reused. |
| Print / PDF | Browser print dialog + generated printable HTML for recipes, collections, and grocery lists. |
| Theme | Light / Dark / System, plus a 10–20pt Text Size slider (device-local) that scales all app text via a CSS custom property. |
| Deployment | Netlify, manual CLI deploys (`netlify deploy --prod`) to `angelo-meal-planner.netlify.app`. Netlify Functions host every AI/external-API call server-side. |

### Color Palette (unchanged from original design)

| Role | Light Mode | Dark Mode | Notes |
|---|---|---|---|
| Background | `#FEF8EE` (warm cream) | `#8A7D6F` (warm grey-brown) | Primary surface |
| Secondary BG | `#F3E2C6` (soft tan) | `#786D5F` (darker brown) | Cards, panels |
| Border / Divider | `#D4B896` (warm sand) | `#9A8E80` (muted tan) | Lines, separators |
| Primary Text | `#1C1C1E` (near black) | `#F5F5F0` (off white) | Body copy |
| Secondary Text | `#6B5C45` (warm brown) | `#C8B9A8` (light tan) | Labels, hints |
| Accent / Link | `#0078D4` (blue) | `#90CAF9` (light blue) | Interactive elements |
| Selected Highlight | `#CCE5FF` (soft blue) | `#CCE5FF` | Active nav items |

---

## 2. First-Run Experience

Three separate first-run overlays exist, gated by settings flags so they never stack on top of each other:

1. **`SetupWizard`** — first thing a brand-new install sees. Household naming + basic setup. Can be skipped and finished later in Settings (a "Skip for now" option exists at each step).
2. **`StarterLibraryPrompt`** — offers two fully independent, optional starter ingredient packs (see below). Self-migrates if the household already has legacy-named ingredients from an older single-pack version of this component.
3. **`CloudSyncPrompt`** (added 2026-07-22) — a one-time-per-session explainer shown to anyone not signed in, explaining Cloud Sync/sign-in and linking directly into Settings → Data → Cloud Sync. Checking "Don't show this again" persists the dismissal (device-local, `cloudSyncPromptDismissed`); a standalone toggle in Cloud Sync settings can turn it back on. A brand-new device always sees it once, regardless of another device's dismissal — this is deliberately never synced.

A **Setup Checklist** widget also lives at the top of the Settings page (`SetupChecklist.tsx`) — a persistent, collapsible progress card tracking 5 required steps (household name, a person profile, first ingredient, first recipe, first planned meal) and 3 optional ones (USDA key, Gemini key, Cloud Sync). Functions as an ongoing "getting started" reference independent of the one-time wizard. It does not track either starter pack's status.

### Two independent starter ingredient packs (2nd pack added 2026-07-23)

`StarterLibraryPrompt.tsx` offers both, each tracked by its own settings flag so loading (or declining) one never affects the other:

| | 101-item USDA set | 867-item Great Value set |
|---|---|---|
| Data source | Hardcoded shorthand array, `src/db/starterLibrary.ts` (`DEFS`) — bundled directly into the JS build | Static JSON file, `public/data/great-value-starter.json` (~1.1MB) — fetched at runtime, never bundled into the JS build |
| Settings flag | `starterLibrarySeeded` + `starterLibraryVersion` | `brandedLibrarySeeded` |
| Auto-seeds silently? | **Yes** — a completely empty install gets these with no prompt at all | **No, never** — always requires an explicit choice, on any install state, even a brand-new empty one |
| Content | Generic raw ingredients (meats, produce, dairy, grains, seasonings) — USDA macros, no barcode/brand/price/Nutriscore/Nova/allergen fields exist in the format at all | Real branded products — barcode, Nutriscore, Nova group, allergens, store, package size, sourced from Open Food Facts |
| Dedup on load | Simple exact-name-match only (`seedStarterLibrary()`) | Barcode + exact-name match, reusing `findIngredientMatch()` from `importNormalization.ts` — the same matching JSON Import uses — but with fuzzy name matching deliberately **off** (see below) |
| Seed logic | `src/db/starterLibrary.ts`, `seedStarterLibrary()` | `src/db/brandedLibrary.ts`, `seedBrandedLibrary()` |

**Why fuzzy matching is off for the branded pack:** `findIngredientMatch()` (shared with JSON Import) supports an optional fuzzy-name fallback on top of barcode/exact-name. Testing this pack against the tiny 101-item generic set surfaced a real false-positive problem — multi-word branded names like "Whole Milk" or "Creamy Peanut Butter" fuzzy-matched against short generic names like "Milk" or "Butter" a large fraction of the time (roughly half the 867 items got wrongly skipped as "duplicates" in testing), which defeated the entire point of offering the two packs as separate, unmerged catalog entries. `findIngredientMatch()` now takes an `{ fuzzy?: boolean }` option (default on, preserving JSON Import's existing behavior unchanged) — the branded pack explicitly passes `fuzzy: false`.

**UI behavior:** when only one pack's decision is outstanding, the prompt shows that pack alone, with the exact same single-button "Load N Ingredients" / "Skip" presentation the original single-pack version always had (byte-identical trigger conditions for the USDA branch — this was a hard requirement when the second pack was added, not just a nice-to-have). When both are outstanding at once (a non-empty install that hasn't decided on either), the prompt shows two checkboxes instead (USDA defaults checked, branded defaults unchecked — it's a much bigger, single-store, more opinionated dataset) with a unified "Load Selected (N)" / "Skip" pair; clicking either button resolves both decisions at once, loading whichever boxes were checked.

---

## 3. Settings Page

Seven tabs (state-driven, no separate routes), deep-linkable via `?section=` query param:

- **Household** — household name/size; per-person profiles (name, Simple/Complex mode, demographics, Payday Schedule).
- **Preferences** — Unit System (Imperial/Metric), Theme, Text Size (presets + 10–20pt slider), Store Preference toggle, Kitchen Reference Photos retention policy (always ask / always keep / always discard).
- **Integrations** — AI Provider dropdown + key (Anthropic/Gemini/OpenAI/Ollama), USDA key, standalone Google Gemini key + model picker (with a live "Check available models" button), Supabase URL + Anon Key.
- **Nutrients** (labeled "Optional Nutrients" in the UI) — toggles for Saturated Fat, Trans Fat, Alcohol, Water Intake, Weight Tracking; macro-history retention window (30–365 days, default 90).
- **Ingredients** — Nutriscore/Nova/allergen badge display toggles; Allergen Watch List (which of the 12 tracked allergens actually trigger a meal-plan warning).
- **Lists** (labeled "Lists Management") — free-form management of ingredient categories, recipe tags (grouped), brands, and stores, with Levenshtein-distance fuzzy-duplicate warnings.
- **Data** — Cloud Sync (Section 11), three-tier Export, Import with conflict handling, and granular per-category Reset.

**Layout note (2026-07-22):** the page is bounded and centered at a 1280px max-width (`.page`), and each tab's ~640px-capped form content is centered within its content pane (`align-items: center` on `.content`) rather than left-aligned — fixes dead space that used to strand itself on the right side only at wide viewports. See Section 14 changelog.

**Reset is still protected** — every reset action requires an explicit confirmation step. Options: reset individual categories, multiple selected categories, or everything.

---

## 4. Ingredient Database

The backbone of the app — every recipe, macro calculation, and grocery list traces back here. `IndexedDB` store `ingredients`.

**Structure:** a parent `Ingredient` (e.g., Ketchup) holds one or more brand `IngredientVariant`s underneath (Heinz, Hunt's, Store Brand), each with its own macros, cost, and serving info.

**Per-variant fields:** brand, default unit, serving size/unit, macros, package cost + total servings in package (app auto-calculates cost per serving, stamps `priceLastUpdated` whenever cost changes), USDA FDC ID, barcode, Nutriscore grade (A–E), Nova group (1–4), allergen flags, optional store/notes.

**Toggles:** Perishable (with a Frozen sub-toggle), Always On Hand (excluded from grocery lists by default), Archive (soft-hide, preserves recipe references) vs. permanent Delete.

**Category system:** 21 user-manageable categories (expanded from an original 15 via a one-time migration). Search by name; filter by category, Nutriscore, Nova group, allergen contains/excludes, and archived status.

**Merging duplicate ingredients (added 2026-07-24):** `mergeIngredients(keepId, mergeAwayId)` in `src/db/mergeIngredients.ts` is a shared, general-purpose capability — not tied to any one duplicate source (barcode leading-zero bugs, JSON Import collisions, Receipt Scanner, manual double-entry, the branded starter pack all produce the same underlying problem: two ingredient records that are really one product). It's a straight one-for-one replacement, no parent/child or multi-variant merge: every reference to `mergeAwayId` is repointed to `keepId`, then `mergeAwayId` is deleted.

*Every place an ingredient id can be referenced, confirmed against the actual data model (`src/types/index.ts`, `src/db/schema.ts`) before writing the repointing logic — not assumed:*
- **Recipes** (`Recipe.ingredients[].ingredientId` / `.variantId`) — repointed. ✅ existing behavior for `.ingredientId`.
- **Grocery lists** (`GroceryItem.ingredientId` / `.variantId`, inside `items[]`/`manualItems[]`/`remainderItems[]`, every list regardless of status) — repointed. **This was a real gap — no repointing existed for grocery lists anywhere in the app before this.**
- **Macro logs** (`MacroLogEntry.variantId` — this type has no `ingredientId` field at all) — repointed defensively. Checked every write path in the app: this field isn't actually populated by anything today, but it's part of the persisted schema, so it isn't assumed safe to skip.
- **Meal plan days/templates** — confirmed these only ever hold a `recipeId` (via `MealSlotItem`), never a direct ingredient reference — repointing recipes covers them transitively, no separate handling needed.
- **Recipe collections** — only hold `recipeIds`, no ingredient reference.
- **Household items, kitchen references, processed receipts, settings** — unrelated entities, confirmed no ingredient reference.
- **Not touched, deliberately:** `src/utils/recentlyLinked.ts`'s device-local "recently linked" list (`localStorage`, capped at 10 entries) — a UI convenience, not persisted app data, and it ages out on its own.

Because this is a straight one-for-one replacement (no variant-matching feature), a reference that had pinned a *specific variant* of the ingredient being merged away is repointed to the **keep** ingredient's *default* variant — there's no reliable way to know which of keep's variants corresponds to the one going away without building real variant-matching, which this deliberately doesn't do. `countIngredientReferences(id)` is the read-only counterpart, used to warn before a plain delete (which does **not** repoint anything, unlike merge) with exact recipe/grocery-list/macro-log counts.

**Category reconciliation (added 2026-07-24):** `mergeIngredients()` takes an optional `MergeOptions.category` — when provided and different from the keep ingredient's current category, it's applied as the last step of the merge. Before this, a category disagreement between the two records was silently resolved by "whichever one was kept wins," with no review step — found live merging real barcode-duplicate pairs (Beef Broth: Meat & Poultry vs. Soups & Broths; Whole Flax Seeds: Baking & Pantry vs. Rice & Grains — see `TEST_FIXTURES.md`). Both merge UIs now show a simple dropdown, but **only when the two records actually disagree** — hidden entirely when categories already match, so the common case stays a single click.

**Two entry points, one implementation:**
- **Dev Tools → Barcode Duplicate Finder**: each candidate pair gets a "Keep" radio (defaults to whichever entry has the *longer* raw barcode string — directly matches the leading-zero bug's own signature, since the intact 13-digit code is the more complete/original one), a **Merge into "…"** button per non-keep entry, a per-entry **Delete** (with the reference-check warning), and a group-level **Skip this pair** (session-only dismissal — reappears on a later scan, nothing is persisted, so a skip can never silently hide a real duplicate forever). A category-conflict dropdown appears per group when the entries disagree.
- **Ingredients page → "Merge…" button** on every ingredient card: opens `MergeIngredientModal`, search for the other ingredient (reuses the existing `IngredientPicker`), then a side-by-side compare with a Keep radio (defaults to the card you started from) showing both ingredients' reference counts before you confirm, plus the category dropdown when needed. For duplicates that have nothing to do with barcodes at all — manually-typed double-entries, two separate imports of the same name.

**⚠️ Known related gap, found but not fixed in this pass:** `src/db/supabase.ts` already had its own, older, narrower duplicate-resolution path (`resolveIngredientDuplicate` / `repointIngredientId`), used when Cloud Sync detects a name collision between a local and cloud ingredient. It only ever repointed `Recipe.ingredients[].ingredientId` — never `.variantId`, never grocery lists, never macro logs. It was **not** switched over to the new shared `mergeIngredients()` in this pass, because one of its two resolution branches (`keep-local`) has a precondition the new function doesn't support: the cloud-side ingredient id being discarded may never have actually been saved as a local `Ingredient` record at all (it was only flagged, never pulled) — `mergeIngredients()` requires both ids to exist locally and throws otherwise. Fixing this properly (e.g., a variant of merge that tolerates a non-existent mergeAway record) is a reasonable follow-up but was out of scope for what was asked here.

**Verification status for the merge feature:** `npm run build` (tsc + vite) passes. The core repointing logic was verified against realistic mock data covering recipes (with and without a pinned variant, plus an unrelated and an unlinked row), all three grocery-list item buckets, macro logs, and the self-merge/missing-ingredient guard clauses — 16/16 checks passed. That mock-data verification was **not** run against a real IndexedDB instance (no `fake-indexeddb`/test runner is installed in this project) and the feature was **not** clicked through live by Claude in a browser (no connected Chrome extension or signed-in owner session was ever available in the sessions that built or extended this). **It has since been confirmed working end-to-end against real production data, done by the user directly**: all 8 real leading-zero duplicate pairs found in the live household database (see `TEST_FIXTURES.md` for the last 3, captured before merging) were resolved via the Barcode Duplicate Finder's Merge action — a fresh scan afterward showed 0 remaining pairs, and each discarded ingredient was confirmed actually gone from the Ingredients list. This is real-world confirmation that the Merge button, the repointing, and the delete all work correctly together in production — it does not by itself confirm every code path (e.g. the reference-check warning on Delete, or a merge that actually touches a linked recipe/grocery item, since none of these 8 pairs had real references to repoint).

**⚠️ Known data issue — one variant with a real macro conflict, unresolved:** the ingredient **"Dill Pickle"** (Great-Value), variant id `644ff973-314e-40b5-986c-e7feea38031d`, has two disagreeing sodium values left over from a one-time schema migration (2026-07-22, see Section 14/15) — `sodium: 900` inside `variant.macros` (this is what the app actually displays/uses today) vs. a leftover flat `sodium: 290` field elsewhere on the same variant object (inert, unused by the app, not cleaned up). Every other flat macro field on this variant is likewise unused/inert. Deliberately left as-is rather than guessing which number is correct — the household doesn't have the original packaging to verify against. **To resolve:** check the actual product label, then edit the ingredient in-app (Ingredients → find "Dill Pickle" → Great-Value variant) and fix the Sodium field directly; the stray flat fields can be ignored (harmless, unread by the app) or cleaned up in a future pass.

**Unit conversion:** Imperial/Metric convert automatically throughout the app based on the Settings preference.

---

## 5. Ingredient Import Methods

*(New section vs. the original design doc — this grew into seven distinct import paths, all funneling through review before anything saves.)*

Seven tabs on the Import Ingredients page: **Barcode Lookup, USDA Lookup, Gemini Lookup, Scan Label, Receipt Scanner, Bulk Entry, JSON Import.** Barcode/USDA/Gemini/Scan Label all route through a shared `ReviewScreen` before saving — nothing auto-saves. Across all seven, saving always requires an explicit user action.

- **Barcode Lookup** — checks local DB first, then Open Food Facts; optional Gemini enrichment fallback if OFF has zero macros.
- **USDA Lookup** — batch search by name, no AI.
- **Gemini Lookup** — AI-driven lookup by product name/brand; requires a Gemini key.
- **Scan Label** — photograph a nutrition-facts panel; AI reads it; low-confidence fields are highlighted for manual review.
- **Receipt Scanner** — photograph a grocery receipt; per-line price/quantity parsing (deterministic math, not AI arithmetic) + barcode-first/name-fallback ingredient matching with confidence tiers; three-way per-line choice (Add as Ingredient / Add as Household Item / Don't Add); a nutrition fallback chain (auto barcode lookup → photograph the product label → on-demand Gemini web search with independently-verified confidence) fills in nutrition for brand-new items created this way. Full behavior detailed below — this is a substantially deeper feature than the one-line summary suggests.
- **Bulk Entry** — manual spreadsheet-style table, no AI.
- **JSON Import** — accepts this app's own export format or an Open Food Facts bulk-converter format; three import modes (Add New Only / Add + Update Existing / Replace).

### Receipt Scanner — detail

*(Verified 2026-07-24 directly against the code — this subsection replaced a one-sentence summary that undersold how much real logic is here.)* Files: `ReceiptScannerTab.tsx` (capture/stage flow), `ReceiptLineReview.tsx` (bulk review + save), `receiptMatching.ts` (matching), `receiptPriceNormalization.ts` (price/quantity parsing), `barcodeValidation.ts` (checksum), `db/processedReceipts.ts` (duplicate detection).

**Identification priority — barcode first, name second, in that strict order.** Any numeric code Gemini reads next to a line is tried as a real barcode before anything else: `barcodeLookupCandidates()` expands it to both the raw digits and its UPC-A ↔ EAN-13 leading-zero equivalent, and each candidate must pass real checksum validation (see below) before being trusted at all — a barcode-shaped string that fails checksum is discarded, never used as identity. A checksum-valid barcode is matched against every ingredient's `variant.barcode` (exact string, all matches collected — not just the first, so a shared-barcode data problem can be caught). A hit here is `tier: 'high'`, auto-selected, and per the code's own comment, "barcode identity always wins over fuzzy name matching and is never overridden by it." Only when no barcode was present, or none of its candidates validated or matched, does the scanner fall back to `findSmartMatches()` (the same name-matching primitive `ReviewScreen.tsx` uses elsewhere in the app) against the AI-parsed item name — multiple hits are re-ordered (brand-mentioned-in-receipt-text first) and capped at 5 candidates, tiered `'high'` for exactly one match or `'medium'` for more than one; medium is never auto-selected.

**Barcode checksum validation — real, not cosmetic.** `isValidBarcodeChecksum()` implements the actual UPC-A (12-digit)/EAN-13 (13-digit) mod-10 check-digit algorithm, not a length or pattern guess. A misread barcode digit fails this and is dropped before it can reach matching.

**Barcode vs. name disagreement — surfaced to the user, not algorithmically "resolved."** When a checksum-valid barcode matches an ingredient, the scanner separately runs `findSmartMatches()` against that same line's parsed name. If the name search doesn't also turn up the barcode-matched ingredient, `barcodeTextDisagreement: true` is set and shown in review — but the barcode match still wins and is still what gets auto-selected; there is no vote or scoring between the two signals, only a flag for a human to notice a possibly-wrong barcode read. Separately, if a barcode matches *more than one* ingredient record (a data-integrity edge case), `barcodeMultiMatch: true` drops the tier to `'medium'` and shows all matches as candidates instead of auto-picking one.

**Staged/atomic approval workflow — real, fully atomic since 2026-07-24.** Nothing writes to the database while lines are parsed or matched — `ReceiptLineReview.tsx` holds every line in local state, independently editable and independently validated (servings > 0, unit price > 0, a name if creating new, a resolved match/Create-New choice, a resolved price decision). Saving only happens on **Save All**. Every write for the batch — *ingredient* ops (`updatePrice` / `addVariant` / `createIngredient`), household-item rows, and the processed-receipt record — goes through `applyReceiptSaveBatch()` as one IndexedDB transaction spanning the `ingredients`, `householdItems`, and `processedReceipts` stores: either the whole Save All lands or none of it does. (Prior to 2026-07-24, only the ingredient ops were atomic — `applyIngredientBatch()` transacted `ingredients` alone, and household items were saved individually in a separate loop right after, so a failure partway through that loop could leave ingredients committed but household items missing. Closed by folding all three stores into one transaction.) Already-saved rows are skipped on a retry, so a partial failure can be re-submitted without double-writing what already landed.

**Duplicate receipt detection — real, and a soft warning, not a hard block.** `findMatchingProcessedReceipt(store, date, total)` checks the newly-parsed receipt's store (trimmed/lowercased), date (exact match), and total (within $0.01, for rounding) against every previously-saved `processedReceipts` record, immediately after Gemini parses the photo and before review even opens. If store, date, or total is missing, the check is skipped — no warning is possible for a receipt Gemini couldn't fully read. A hit shows a dedicated screen ("This looks like a receipt you've already processed...") with **Cancel** or **Proceed Anyway**; proceeding continues straight into normal review, so nothing is actually blocked, only flagged. Crucially, a `processedReceipts` row is only written at the end of a *successful* Save All — scanning a receipt and abandoning the review leaves no record, so it won't trigger the warning on a later re-scan.

**Sale/discount detection — real, exactly the ">10%" pattern.** `priceDeltaInfo()` computes `pct = |newPrice − oldPrice| / oldPrice` and flags `isSaleRange` at `pct >= 0.10`. It only appears when a line is matched to an existing variant that already has a different `packageCost`. Below 10%, the prompt is a plain "Update?" (Update price / Keep old price). At 10%+, the box is visually flagged and reworded to "...this could be a sale," offering **Update baseline price** or **This was a sale — don't update**. Choosing the sale option (`priceDecision: 'sale-skip'`) still marks the row saved but queues no price-update op — the existing price is left untouched. Nothing about the flagged sale price is logged anywhere; it's a same-session prompt only, not a price-history feature.

**Matching code reuse — partial, not the shared `findIngredientMatch()` pipeline.** Receipt Scanner does **not** use `findIngredientMatch()` / `importNormalization.ts` — confirmed neither is imported anywhere in the Receipt Scanner files; that function is used only by JSON Import and the branded starter-pack seed (see the 2.2 changelog entry). Receipt Scanner has its own `receiptMatching.ts`, which reuses `findSmartMatches()` directly from `smartDuplicate.ts` for name matching, but layers its own barcode-priority sequencing on top — including its own `findAllBarcodeMatches()` rather than `smartDuplicate.ts`'s `findBarcodeMatch()`, since Receipt Scanner needs *every* ingredient sharing a barcode (to detect `barcodeMultiMatch`), not just the first hit `findBarcodeMatch()` returns.

---

## 6. Cookbook / Recipe Book

**Per-recipe fields:** name, multi-group tag system (Protein, Cook Method, Cuisine, Source, Type, Extras — user-managed per group), linked ingredient list with quantity/unit/serving-display, numbered reorderable steps, optional notes, Prep + Cook Time (flexible text input, e.g. "90 min" auto-corrects to "1 hr 30 min"), Favorites, Templates (save-as-template, clone into an editable copy), one optional photo (2MB limit, plus drag-drop/clipboard-paste support), recipe source (URL/name), auto-calculated macros and estimated cost per serving.

**Verified Serving Count:** a checkbox the user checks after actually cooking and portioning a recipe — unverified recipes show an amber "not verified" warning since per-serving nutrition is only as good as the serving count.

**Recipe pricing completeness:** estimated cost only displays when *every* linked ingredient has a package cost — otherwise the app shows "missing pricing for N ingredients" instead of a silently-wrong partial total.

**Missing ingredient handling:** a recipe ingredient line can be "unlinked" (display-text only, excluded from macro/cost calculation) — the editor warns before saving if any lines are unlinked.

**Recipe scaling:** change the serving count at any time; all quantities, macros, and cost recalculate live.

**Recipe import — three methods, all requiring an AI Provider or Gemini key, but not identically without one:** URL (AI fetches + parses — **hard-blocked** without an AI key, no non-AI fallback exists for this specific method), pasted text (AI parses — **soft fallback** without an AI key: the pasted text still opens as a side-by-side reference panel to type from, rather than failing outright), and **photo** (AI reads a photographed recipe page — printed or handwritten; requires Gemini specifically, not just any AI provider). All three land in the same editable review screen before saving; manual entry (+ New Recipe, typed from scratch) is always available regardless of AI configuration, independent of the two import-specific fallback behaviors above.

**Recipe Collections** *(not in the original design doc)* — a named, manually-orderable folder of recipe IDs. Create/rename/delete; reorder/remove recipes within one; export a collection to a formatted, configurable PDF (table of contents, photos, nutrition, cost, and auto-matched Kitchen Reference pages from the same source tags).

**Kitchen Reference** *(not in the original design doc)* — standalone reference text/notes not tied to any recipe (8 content types: Tips, Herbs & Spices, Pantry Lists, Measurements, Charts & Tables, Table & Presentation, Cooking Terms, Personal Notes). Can carry a photo and/or structured table data; digitizable via an AI photo scan (Gemini) that extracts title/content/table fields directly, with a keep/discard-the-photo decision governed by the Kitchen Reference Photos setting.

---

## 7. Meal Planner

Calendar-based scheduler: full multi-week grid (1–4 weeks) on wide screens, a 3-day swipeable strip on narrow mobile-portrait.

**Per day:** Breakfast, Lunch, Dinner (always present) + optional Snacks (and a Drinks slot used by the Macro Tracker). Each slot supports a primary dish, unlimited side dishes, an optional dessert, a Leftover link (marks the slot as leftovers from an earlier planned meal — excluded from grocery generation, macros pulled from the original), and Shared (whole household, macros divided by household size) vs. Individual (per-person) assignment.

**Assigning recipes:** browse-and-pick from a filtered cookbook picker, or an "Add to Meal Plan" button directly on any recipe.

**Templates:** save any planned week as a named, reusable template; apply to any week as a starting point.

**Copy Week:** copy one week's plan onto another week (replaces existing meals there).

**Post-generation warning:** if the plan changes after a grocery list was already generated for that date range, a non-blocking warning suggests regenerating the list.

**Payday markers:** small colored dots on calendar days matching a person's configured Payday Schedule (frequency + next payday date + custom color) — purely visual, never blocking.

**Day tiles show:** an "not fully planned yet" indicator (yellow → green once filled), payday markers, allergen warnings (cross-referenced against the Allergen Watch List), and estimated cost.

---

## 8. Macro Tracker

Fully optional; supports up to 10 people, one tab per person.

**Simple vs. Complex mode** (`PersonMode`, set per-person in Settings → Household): **Simple** — name only, log by servings, no goals. **Complex** — collects age/weight/height/sex/activity level and supports goal-setting + progress bars. Both modes log meals identically; the difference is purely in the layer on top. Switching modes any time preserves data.

**Goal setting (Complex mode only), per-person, two methods:**
- Individual Targets — a direct numeric target per nutrient.
- Calorie + % — total calorie goal + protein/carb/fat percentages (grams computed live); fiber/sugar/sodium still set individually either way.

**⚠️ Known gap:** there is no TDEE/BMR calculator anywhere in the codebase. The age/weight/height/sex/activity-level fields collected on a Complex-mode person are captured but never used to compute a suggested calorie goal — goal-setting today is 100% manual number entry. A Mifflin-St Jeor-based "suggest from my stats" feature has been scoped conceptually but not built. This was true in the original design doc too (goal-setting was always meant to be manual) — flagging it here because it reads like an obvious next feature and isn't currently planned/in-progress.

**Nutrients tracked:** the full standard set (calories/protein/carbs/fiber/sugar/fat/sodium) plus optional sat fat/trans fat/alcohol (app-wide toggles). Display density varies by view — the weekly summary only shows calories/protein/carbs/fat, for example.

**Logging paths:** from the meal plan (servings stepper pulls macros from the recipe), or fully manual entry (label + macros typed directly, no recipe needed). There is no direct "log an ingredient" path — only via a recipe or manual entry. Water and weight log as special entry types.

**Views:** daily totals (print-friendly) and a 7-day weekly summary modal (daily average, goal row, weight-log list). No monthly+ view exists.

**Macro logs are entirely device-local** — never synced, by design (see Section 11).

---

## 9. Grocery List

One active list at a time, generated from a chosen date range within the meal plan; consolidates and deduplicates ingredients across every recipe in range, grouped by category (optionally by store if Store Preference is enabled).

**Always On Hand check** runs on generation — items marked always-on-hand are held back with a confirm-you-still-have-it prompt rather than silently excluded every time.

**Household Items** — a separate persistent list of non-recipe staples (paper towels, cleaning supplies, etc.), with Quick Add and full Manage tabs; items push onto the active list on demand.

**Partial Purchase:** any item can be marked Partially Bought with a quantity entered; the remainder auto-generates onto a Remainder list, which chains the same way if partially bought again.

**Shopping History:** a collapsible archive of past completed/archived lists (Recipe Items / Manual Items / Remainder, broken out separately). Generating a new list archives the previous active one.

**Output:** interactive checklist while shopping, plus print/PDF export at any time.

---

## 10. Payday Schedule

Unchanged from original design — set up per person in Settings → Household: pay frequency (weekly/bi-weekly/semi-monthly/monthly), next payday date (app calculates all future ones), a custom color. Shows as a small colored dot on Meal Planner calendar days; multiple people sharing a day stack their dots. Purely visual, never blocking.

---

## 11. Cloud Sync, Household Sync Code, Family Share & Account Sign-In

*(Fully built. The original design doc listed this under "Intentionally Left for Later" — that's no longer accurate as of this rewrite.)*

Core engine: `src/db/supabase.ts`. UI: Settings → Data → Cloud Sync.

### Two layers, deliberately separable
1. **Account sign-in** (added 2026-07-21/22, `AccountSection.tsx`) — real per-user Supabase Auth (email + password). Sign up/in/out; create or join a **household** by code; owner-only member role management (owner/contributor/readonly). This is the recommended path for a new setup.
2. **Household Sync Code** — the older mechanism: a shared human-memorable string (e.g. `adjective-noun-1234`). Still works fully standalone without ever signing in — creating a household via Account sign-in just auto-fills this code for you. Historically this code alone was the *entire* access model (a plaintext string checked with wide-open `using (true)` RLS policies); the Account layer adds real per-user access control on top without removing the old path.

### What syncs
Eight cloud tables, everything scoped by household code: ingredients, recipes, meal plans, grocery lists, household items, collections, kitchen references, and a curated subset of settings (`sync_settings`). **Never synced:** all API keys, device theme/text-size preferences, the sync credentials themselves, one-time migration flags, `cloudSyncPromptDismissed`, and — deliberately — **macro logs and weight history**, which stay entirely device-local/personal.

### Push/pull mechanics
Full-state fetch before push or pull (paginated, handles large households); duplicate-safe in both directions (checks same-name-different-id before creating a second row); three-way conflict resolution (Keep Mine / Keep Both / Keep Theirs — note Keep Both doesn't repoint recipe references the way the other two do); newest-`updated_at`-wins merge for non-duplicate conflicts. **Entirely manual/button-triggered** — no background sync, no sync-on-load. The only automatic Supabase traffic is a once-per-23-hours no-op keep-alive ping to stop the free tier from auto-pausing.

### Family Share
A second mode of the same engine (same UI card group) for sharing with family in a different home: separate `familyShareCode` (partitioned as `<code>:family`, never collides with household data), syncs **only recipes and ingredients** (cost fields stripped before upload — the point is not exposing your prices/stores), with an owner/contributor/readonly role system enforced before any network call for readonly.

### Setup — self-service now fully wired (fixed 2026-07-22)
Settings → Data → Cloud Sync has **two** "Show setup SQL" toggles: the original one creates the 8 data tables (`SUPABASE_SETUP_SQL`); a second one (added 2026-07-22) exposes the `households`/`household_members` tables, the `create_household`/`join_household_by_code` RPCs, and three sequential bug-fix scripts, concatenated in the exact order they were authored and tested — this was a real gap found while auditing the Help page: without it, a brand-new Supabase project's Account sign-in would fail with a raw Postgres error and no path forward.

### Outstanding security note
Every data-table RLS policy still includes a bridge clause (`household_code = the literal current code OR real membership`), so the pre-auth vulnerability (anon key + code = full read/write access) is **not yet closed** for the household actually running this app. Closing it ("Phase 3" — dropping the bridge clause) is a deliberate later step, only meant to run after the real household's owner has signed up and joined through the new Account UI themselves and confirmed it works.

### Dev Tools access control (added 2026-07-23)

`/dev-tools` (nav item + route, both gated) is the app's first feature to actually *consume* the owner/contributor/readonly role system for something beyond household-member management itself. Gate logic lives in `src/hooks/useIsHouseholdOwner.ts`, consumed by both `AppLayout.tsx` (hides the nav item) and `DevToolsPage.tsx` (redirects the route itself to `/ingredients` — the nav being hidden alone is not real access control, since the URL is still typeable).

**Important distinction — there are two different "owner/contributor/readonly" concepts in this codebase, and Dev Tools deliberately uses only one of them:**
- **Real household member role** (`household_members.role` in Supabase, read via `getMyHouseholds()` in `db/auth.ts`) — DB-backed, RLS-protected, settable only by an existing owner via the "Manage members" UI. **This is what gates Dev Tools.**
- **`settings.familyShareRole`** — a plain local settings field, self-declared by whoever's using the device, used only for client-side Family Share push/pull gating (see above). Trivially editable by anyone in Settings. **Never used for Dev Tools** — using this instead would have been a real access-control hole.

**Resolution logic (revised 2026-07-24, fallback removed 2026-07-24 — see bug and risk-review below):** signed in → fetch the user's households → try to find the one whose `code` case/whitespace-insensitively matches this device's *active* `householdSyncCode` → if found, true only if that specific membership's role is `'owner'`. **If no confident match is found at all (code unset, stale, or a deeper mismatch than casing), this fails closed — `false`, full stop.** No cross-household fallback.

**🐛 Real bug, found and fixed 2026-07-24:** the app's real production household had `households.code = "Angelo-Family-2026"`, but the `household_code` actually stamped on that same household's synced data rows was `"angelo-family-2026"` / `"Angelo-family-2026"` (mixed casing across rows — confirmed directly against the live database with a service_role query). `settings.householdSyncCode` on the affected device held one of the lowercase variants, so the original exact-match check silently failed for a genuine, verified owner — no error, no indication anything was wrong, just an absent nav item. Not a caching or timing issue (the user had already hard-refreshed and fully restarted the app with the same result before this was reported) — a pure string-equality bug. **Fixed by normalizing casing/whitespace before comparing — that alone resolves this specific bug, with no need for a broader fallback.**

**🐛→⚠️ Second look, same day: the fallback that first shipped alongside the casing fix was itself a regression risk, and was removed.** The initial 2.5 fix paired the casing normalization with a second change: if no active-household match resolved at all, fall back to "owner of any household this signed-in account belongs to," reasoned as low-risk since Dev Tools has no cross-household data access. On review this didn't hold up as a durable design: it fires on *any* unresolved match, not just the casing case (unset code, stale code, a future regression in `getMyHouseholds()`), and it would silently reopen exactly the scenario the original strict design was meant to prevent — a contributor of the household actually in use, who happens to separately own some unrelated household, getting Dev Tools access to the one they don't own. It was "safe" only because today's one Dev Tools entry (the Ingredient Converter) happens to show nothing household-specific — an accidental property of current content, not an enforced constraint, and the page's own code comment explicitly commits future tools to not needing to revisit this gate. **Removed the fallback entirely; an unresolved match now fails closed (`false`).** This intentionally reopens the original narrow risk the casing fix's fallback was trying to also cover — a genuine owner whose active-household match fails to resolve for some *other*, not-yet-seen reason would now lose Dev Tools access too, surfacing as an apparent missing feature rather than an error — accepted as the right tradeoff over silently granting access to the wrong person.

**No fallback *access* path exists on purpose** — matching logic aside, there is still no local PIN, no device flag, no offline override, no path to `true` other than a confidently-resolved owner membership on the active household. A household that has never set up Account/Cloud Sync at all gets the same "absent" outcome as a signed-in contributor: hidden nav item, and typing `/dev-tools` directly redirects away with no error message or explanation (not "locked," just not there). Verified directly: fresh install with no Supabase configured, and Supabase configured but not signed in — nav item absent, direct navigation redirects, zero console errors, in both. **The positive "real owner" path (case-insensitive match) was independently live-verified on 2026-07-24**, before the fallback was removed — a disposable Supabase test user + household + owner membership were created with the same deliberately-mismatched casing as the real bug, signed in through the actual app UI via Playwright, and confirmed: Dev Tools nav item appears, `/dev-tools` loads without redirecting, page content renders, zero console errors. That case-insensitive matching code is unchanged by the fallback removal, so this verification still stands; **the fallback removal itself (fail-closed behavior for an unresolved match) was verified by code review only, not re-run live** — the live-test setup needs a Supabase service-role key and a connected browser, neither available in the session that made this change.

**What's in Dev Tools today:** two entries. The **Ingredient Converter** (`public/dev-tools/script.py`, downloadable, run locally in the household's own Python environment — the app only hosts the file, instructions, and warnings, it never executes anything) and the **Barcode Duplicate Finder** (client-side, runs in-app — see below). Built to be extensible — additional tools are meant to be added as sibling sections in the same page, not a rearchitecture.

**🐛 Real bug, found and fixed 2026-07-24: the Ingredient Converter silently stripped leading zeros off barcodes.** In `row_to_ingredient()`, `script.py` parsed the barcode ("code") column via `str(int(float(barcode_raw)))` — round-tripping an identifier through numeric conversion, which drops any leading zero (`"0079492041754"` → `"79492041754"`). Confirmed as a real, not hypothetical, production problem: the user found 8 duplicate ingredient pairs in the live household database where the same physical product had been imported twice under two different-looking barcodes purely because one import kept its leading zero and the other lost it — defeating barcode-based duplicate detection for exactly those pairs. Investigation found the bug was worse than the symptom suggested: pandas' own automatic dtype inference on an all-digit column strips the leading zero **before `row_to_ingredient()` ever runs** — confirmed live for both CSV and XLSX, including an XLSX cell where the source genuinely stored the barcode as text with the zero intact. A fix scoped only to the `row_to_ingredient()` parsing logic would not have worked; the value is already corrupted by the time that function sees it. **Fixed in script.py v5** two ways: (1) `process_file()` now forces the barcode column to string dtype at `pd.read_csv`/`pd.read_excel` read time — the only point the zero can actually be preserved; (2) `row_to_ingredient()` no longer touches `float()`/`int()` at all for the barcode field, keeping the original string exactly as given, with a defensive (not primary) fallback for the case something upstream still hands it a float. Verified directly: reproduced the pandas dtype-inference loss against a real tab-separated OFF-style export and a text-cell XLSX, confirmed the old code lost the zero in both, and confirmed the v5 fix preserves it end-to-end through `process_file()` → `row_to_ingredient()` in both formats, plus edge cases (missing barcode column, no barcode value, a defensive-path float input). **Anyone who ran an earlier version of the converter should assume their imported data may have this same duplicate pattern** — re-running the fixed script does not retroactively fix data already imported; use the Barcode Duplicate Finder below to check.

**Barcode Duplicate Finder (added 2026-07-24, Merge/Keep/Skip/Delete actions added 2026-07-24):** a one-time cleanup companion to the bug above. `src/utils/barcodeDuplicateScan.ts`'s `findLeadingZeroBarcodeDupes()` loads all (non-archived) ingredients, strips leading zeros from every variant barcode, and groups by the stripped value — surfacing any group where more than one *distinct raw string* maps to the same stripped value (a group where every entry already shares the identical raw string is a plain, ordinary duplicate, not this bug, and is deliberately not flagged). Runs entirely client-side against the local IndexedDB data, on a manual "Scan" button click — nothing runs automatically. Each result group now has real actions, not just a review link: a **Keep** radio (defaults to the entry with the longer/more-complete raw barcode), **Merge into "…"** per non-keep entry (see Section 4's "Merging duplicate ingredients" for the full mechanics — this is the same shared `mergeIngredients()` the Ingredients page's general Merge button uses), a per-entry **Delete** with a reference-check warning (via `countIngredientReferences()`), and a group-level **Skip this pair** (session-only, not persisted). Verified: the grouping/normalization logic was tested against realistic mock data (two real leading-zero pairs plus deliberate control cases) and correctly found only the real pairs; the merge repointing logic was separately verified against mock recipes/grocery-lists/macro-logs (16/16 checks); `npm run build` passes. Deployment itself was confirmed live by fetching the exact production-hashed JS bundles directly and grepping for the new UI strings. **Since confirmed working end-to-end by the user against real data**: all 8 real leading-zero duplicate pairs in the live household database were resolved through this exact UI (Keep defaults verified correct, Merge action used for all 8), a fresh scan afterward showed 0 remaining pairs, and the discarded ingredients were confirmed gone — see `TEST_FIXTURES.md` for the last 3 pairs' full data, captured before merging.

---

## 12. Data Model — Quick Reference

IndexedDB database `MealPlannerDB`, 11 object stores: `settings`, `ingredients`, `recipes`, `mealPlanDays`, `mealPlanTemplates`, `macroLogs`, `groceryLists`, `householdItems`, `collections`, `references`, `processedReceipts` (one row per successfully-saved Receipt Scanner batch — store/date/total plus optional photo, used for the soft duplicate-scan warning; see Section 5's Receipt Scanner detail for the full match/write mechanics). Full field-level type definitions live in `src/types/index.ts` — this document intentionally doesn't duplicate them field-by-field to avoid drifting out of sync with the actual types; check there (or the more detailed code-verified snapshot referenced in Section 15) for exact shapes.

---

## 13. Known Gaps / Intentionally Not Built

Updated from the original "Intentionally Left for Later" list — Cloud Sync is removed (it's built, see Section 11); everything else below is still genuinely not started:

- **Full native Android APK** — Capacitor-wrapping the same React codebase is still a plausible later step, not started.
- **Notifications and reminders** (meal logging, shopping trip reminders) — not built.
- **Undo / redo** — not built anywhere in the app.
- **App localization** beyond English — not built.
- **Actual spending tracking vs. estimated cost** — the architecture (real package costs entered per ingredient) supports this, but there's no feature that logs what was actually spent on a shopping trip against the estimate.
- **TDEE/BMR calculator** for Macro Tracker goals — see Section 8. Demographic fields are collected but unused.
- **Cloud Sync Phase 3** (closing the legacy-code bridge policy) — see Section 11, deliberately deferred pending the real household owner completing sign-up.

---

## 14. Build Notes & Decisions

### Key architectural decisions (original, still true)
- React PWA first; native APK conversion (if it ever happens) stays a later, separate step — one codebase either way.
- IndexedDB for all local storage; the app works fully offline after first load.
- AI provider is pluggable — never hard-coded to one vendor.
- The ingredient database is the single source of truth for all macros and costs app-wide.
- Nothing should block the user — warnings are subtle/non-blocking; optional features are truly optional; data is never deleted silently (archive-before-delete, confirm-before-reset).

### Newer decisions worth recording
- **Selective click-outside-to-close on modals** (2026-07-22): read-only modals close on backdrop click as before; modals with unsaved editable input now show a "Discard changes?" confirm instead of silently closing, via a shared `useConfirmClose` hook + `ConfirmDiscardDialog` component. Explicit X/Cancel buttons stay immediate/unguarded by design — only backdrop click and (where a modal already had one) Escape go through the guard. Fixed two real data-loss bugs in the process (`ReferenceEditor`, `RecipeImportModal` mid-photo-capture).
- **Settings page container width** (2026-07-22): the page is capped at 1280px and centered as one block (header + checklist + tabs/content together), and each tab's form content is centered within its content pane rather than left-aligned — see Section 3. The other five main pages (Ingredients, Cookbook, Meal Plan, Macros, Grocery) use grids/flex-rows with no artificial width cap and don't have the equivalent issue; audited and confirmed via repo-wide search, no changes needed there.
- **Documentation drift is actively tracked now**: an audit on 2026-07-22 found the in-app Help page and this reference document had both drifted significantly out of sync with the real app (most notably: neither mentioned Account sign-in at all). Both were brought current the same day. The lesson driving this document's existence going forward: update it *as part of* landing a significant change, not as a separate later cleanup pass.
- **Ingredients-table schema migration** (2026-07-22): found and fixed a real data inconsistency directly in the Supabase `ingredients` table — 744 variants (out of 6,130 rows / ~6,142 variants) stored their macro fields flat on the variant object (`variant.calories`, `variant.fat`, etc.) instead of nested inside `variant.macros.{}`, which is the only shape the app's own code ever reads (`variant.macros.calories`). Root cause not fully diagnosed (likely an older import/write path that predated the nested-macros convention), but the fix was purely structural — move the 9 known macro fields (`calories`, `protein`, `carbs`, `fiber`, `sugar`, `fat`, `sodium`, `saturatedFat`, `transFat`, plus `alcohol` where present) into `macros: {}` and delete them from the top level, no value changes. Full table backed up to a local JSON file before any writes; dry-run reviewed before applying. Ran via a one-off Node script using the Supabase **service_role** key (required a one-time `grant select, insert, update, delete on public.ingredients to service_role;` — this project's table grants had only ever covered `anon`/`authenticated`, a gap from the same migration work described in Section 11). 741 of 744 were unambiguous; 2 more (Mustard, Lemonade) had a stray *partial* nested `macros` object whose one populated field agreed with the flat data, so those were merged in as the complete set too. One (Dill Pickle) had a real value conflict and was deliberately left untouched — see the flag in Section 4.

---

## 15. Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06 | 1.0 | Original design-intent document (`.docx`) — written before most of the build, describing the agreed target design. |
| 2026-07-22 | 2.0 | Full rewrite as `.md`, from a code-verified audit of the actual current app. Corrected stale claims (Cloud Sync moved out of "later," Macro Tracker's missing TDEE calculator flagged, etc.), added everything built since v1.0 that was never documented (Ingredient Import's 7 tabs including Receipt Scanner, Recipe Collections, Kitchen Reference, real Account sign-in + households, AI Provider vs. standalone Gemini key distinction). Logged the Settings-page layout fix and the modal click-outside-to-close feature as the two build changes landing alongside this rewrite. |
| 2026-07-22 | 2.1 | Logged a direct Supabase data migration (744 variants: flat macro fields → nested `macros: {}`, no value changes) and flagged one unresolved data conflict (Dill Pickle sodium: 900 vs 290) in Section 4 for manual follow-up. |
| 2026-07-23 | 2.2 | Added a second, fully independent starter ingredient pack (867 Great Value branded products, Open Food Facts sourced) alongside the original 101-item USDA set — documented in full in Section 2. New `brandedLibrarySeeded` settings flag, new `src/db/brandedLibrary.ts` seed module, new `public/data/great-value-starter.json` static data file. Extracted `findIngredientMatch()` out of JsonImportTab into the shared `importNormalization.ts` (now used by both JSON Import and the new branded pack) and added an opt-out `fuzzy` flag after testing showed fuzzy matching against the tiny generic set produced a high false-positive rate. |
| 2026-07-23 | 2.3 | Added a Dev Tools section (`/dev-tools`), gated to the signed-in owner of the currently active household only — see Section 11's new "Dev Tools access control" subsection for the full model, including the deliberate distinction between the real DB-backed household role and the unrelated self-declared `familyShareRole` setting. First entry is the Ingredient Converter (downloadable `script.py`, run locally — the app only hosts the file/instructions, never executes it). New `src/hooks/useIsHouseholdOwner.ts`, new `src/pages/DevTools/`. |
| 2026-07-23 | 2.4 | Copy-only fixes to the in-app Help page's Getting Started steps 2–4 (nutrition tracking isn't automatic just from adding a person; barcode scanning needs no setup at all, corrected a wrong assumption; recipe URL/paste import needs an AI key). Also fixed two related inaccuracies found while checking for the same pattern elsewhere: the Cookbook section's "Import from a website"/"Import by pasting text" bullets claimed automatic AI parsing with no dependency caveat (inconsistent with the adjacent, correctly-caveated "Import from a photo" bullet), and the Gemini card in Setting Up Free Services conflated "skip Gemini" with "skip AI entirely," incorrectly implying URL import has a manual fallback when it's actually hard-blocked without any AI key. Tightened Section 6 here to record the same URL-hard-block-vs-paste-soft-fallback distinction. No functional/behavioral changes — text only. |
| 2026-07-24 | 2.5 | **Bug fix:** Dev Tools wasn't appearing for the real, verified household owner — reported by the user after the 2.3 release, whose own "positive path not independently verified" flag turned out to be exactly where the problem was. Root cause: `households.code` and the `household_code` on that household's actual synced data rows disagreed on casing ("Angelo-Family-2026" vs. "angelo-family-2026"/"Angelo-family-2026" — confirmed live against the database), so `useIsHouseholdOwner()`'s exact-match check silently failed. Fixed with case/whitespace-insensitive matching plus an any-owned-household fallback (see Section 11's updated "Dev Tools access control"). This time genuinely live-verified: created a disposable Supabase test user/household/owner-membership with the same mismatched-casing setup, signed in through the real app UI, confirmed Dev Tools actually appears and the route loads, then deleted the test data. |
| 2026-07-24 | 2.6 | **Documentation accuracy pass, no functional changes.** Section 5's Receipt Scanner entry was one sentence ("fuzzy ingredient matching with confidence tiers"); code-verified against `receiptMatching.ts`, `receiptPriceNormalization.ts`, `barcodeValidation.ts`, `db/processedReceipts.ts`, `ReceiptScannerTab.tsx`, and `ReceiptLineReview.tsx`, then expanded into a full subsection covering: barcode-first/name-fallback identification priority, real UPC-A/EAN-13 checksum validation, barcode-vs-name disagreement flagging (barcode always wins; the flag is informational only), the batched/mostly-atomic Save All workflow (ingredient writes are one transaction; household-item writes are not), `processedReceipts`-based duplicate-scan detection (a soft warning, not a hard block, and only recorded after a successful save), the exact ">10% price delta" sale-detection rule, and confirmation that Receipt Scanner does **not** use the shared `findIngredientMatch()`/`importNormalization.ts` pipeline — it reuses `smartDuplicate.ts`'s `findSmartMatches()` but has its own separate barcode-matching logic. Also added a cross-reference from Section 12's `processedReceipts` store listing back to this new detail. |
| 2026-07-24 | 2.7 | **Security-relevant fix, reverting part of 2.5:** removed the "owner of any household this signed-in account belongs to" fallback added in 2.5 alongside the casing fix. User challenged it directly against Section 11's own stated original design goal (stop a contributor of the active household from getting Dev Tools via an unrelated owned household) and asked for a genuine risk walkthrough rather than a restatement of the existing rationale. On review: the fallback's "low risk" justification held only because today's single Dev Tools entry (Ingredient Converter) happens to expose nothing household-specific — an accidental property of current content, not an enforced constraint — and it fires on *any* unresolved active-household match, not just the casing case it was introduced for. `useIsHouseholdOwner()` now fails closed: an unresolved match returns `false`, full stop, no fallback. The case/whitespace-insensitive matching from 2.5 (which fixes the originally-reported casing bug on its own) is unchanged. Explicitly accepted tradeoff: a genuine owner whose match fails to resolve for some other reason will now also lose Dev Tools access, surfacing as a support question rather than a silent wrong-access grant. The fallback removal itself was verified by code review only — no live browser/Supabase re-test was run (extension not connected, no service-role key available this session); the original case-insensitive-match verification from 2.5 is unaffected and still stands. See Section 11's updated "Dev Tools access control." |
| 2026-07-24 | 2.8 | **Bug fix + new tool:** the Ingredient Converter (`script.py`) silently stripped leading zeros off barcodes — user confirmed 8 real duplicate ingredient pairs in the live household database caused by this (same product, imported twice under two different-looking barcodes). Root cause was worse than a simple `float()`/`int()` round-trip in `row_to_ingredient()`: pandas' own automatic dtype inference on the barcode column strips the leading zero at `pd.read_csv`/`pd.read_excel` read time, before any of the script's own code runs — confirmed for CSV and for XLSX (even when the source cell genuinely stores the barcode as text). **Fixed in script.py v5**: `process_file()` now forces the barcode column to string dtype at read time, and `row_to_ingredient()` no longer touches `float()`/`int()` for barcodes at all. Verified by reproducing the pandas dtype-loss bug directly, then confirming the fix preserves leading zeros end-to-end for CSV, XLSX, a missing-barcode-column file, and a defensive-fallback float input. Also added a new Dev Tools entry, the **Barcode Duplicate Finder** (`src/utils/barcodeDuplicateScan.ts`, new `DevToolsPage.tsx` section) — a manual-trigger, client-side scan of existing ingredients for leading-zero-mismatched barcode pairs, surfaced for manual review/merge (no auto-fix), with a direct `/ingredients?edit=<id>` link per candidate. Its grouping logic was verified against realistic mock data including deliberate non-matching control cases; the UI itself was not live-clicked (no connected browser or owner test credentials available this session). Dev Tools' own instructions now warn that anyone who ran an earlier converter version should check their data with the new finder. See Section 11's "Dev Tools access control" for the full writeup. |
| 2026-07-24 | 2.9 | **New shared capability: ingredient merge.** Added `mergeIngredients(keepId, mergeAwayId)` (`src/db/mergeIngredients.ts`) as a general-purpose, reusable merge — not built only inside the Barcode Duplicate Finder, since duplicate ingredients come from multiple sources (barcode bugs, JSON Import collisions, Receipt Scanner, manual double-entry, the branded pack) with the same underlying fix. Every reference type an ingredient id can appear in was checked against the actual data model before writing any repointing logic — recipes and grocery lists (a real, previously-nonexistent gap for grocery lists specifically) are repointed; macro logs are repointed defensively (field exists in the schema, confirmed unused by any current write path); meal plan days/templates and collections were confirmed to need no direct handling (transitive through recipes). Two entry points now share this one implementation: the Barcode Duplicate Finder (Keep/Merge/Skip/Delete actions per candidate pair, default Keep = longer/more-complete barcode) and a new **"Merge…" button on every Ingredients page card** (search-and-pick any other ingredient, side-by-side compare, confirm). Also found and documented (not fixed — different preconditions, out of scope) a related gap in Cloud Sync's older, separate duplicate-resolution path in `db/supabase.ts`, which never repointed variant ids, grocery lists, or macro logs. See Section 4's "Merging duplicate ingredients" for the full reference-type list and verification detail (mock-data-verified repointing logic, 16/16 checks; build passes; deploy confirmed live by fetching production bundles directly; not clicked through live end-to-end — no browser/credentials available this session). |
| 2026-07-24 | 2.10 | **Barcode duplicate cleanup closed out, merge feature now real-world confirmed.** The user manually merged the last 3 of the 8 real leading-zero duplicate pairs found in the live household database (Polish Smoked Sausages, Beef Broth, Whole Flax Seeds — full pre-merge data captured in the new `TEST_FIXTURES.md` at repo root, including two data-quality patterns noticed in the process: all 3 discarded records carried "Organic"/"All Star" in the **brand** field while the kept records carried it in the **name** field instead, and 2 of the 3 pairs also disagreed on **category** despite being confirmed the same product by barcode — `mergeIngredients()` doesn't reconcile that, the kept record's category simply wins). A fresh Barcode Duplicate Finder scan afterward showed 0 remaining pairs; all 3 discarded ingredients confirmed gone from the Ingredients list. This is the first real, live, user-driven confirmation that the Merge button (added in 2.9) actually works end-to-end in production, closing the "not clicked through live" caveat from 2.8/2.9 — see Section 4 and Section 11 for updated verification-status language. |
| 2026-07-24 | 2.11 | **Two OPEN_ITEMS.md fixes, done autonomously while the user was away, deployed and bundle-verified live.** (1) Receipt Scanner's atomic-transaction gap: `applyIngredientBatch()` (ingredients-only) replaced with `applyReceiptSaveBatch()`, one IndexedDB transaction now spanning `ingredients` + `householdItems` + `processedReceipts` — a mid-batch failure can no longer leave ingredients committed but household items or the processed-receipt marker missing. (2) `mergeIngredients()` category reconciliation: new optional `MergeOptions.category` param, applied as the merge's last step; both merge UIs (Barcode Duplicate Finder, Ingredients page) now show a simple dropdown when the two records being merged actually disagree on category — exactly the gap found live in the 2.10 entry above (Beef Broth, Whole Flax Seeds). Both changes build-verified, logic-verified against mock data (16/16 and 4/4 checks respectively), deployed to production, and confirmed live by fetching the exact production-hashed bundles and grepping for the new code — not clicked through live (no browser access this session). A third item, importing the 366-item USDA comprehensive JSON, was investigated but not completed: the file was located (`C:\Users\ionic\Downloads\usda_comprehensive.json`, outside the repo) and fully pre-verified (valid shape, no internal duplicates, category names all match, flat-macro-field variants confirmed safe via `importNormalization.ts`'s existing flat/nested merge logic) — but actually importing requires the JSON Import UI in a real signed-in browser session, which isn't something Claude can do without live browser access. Left open in `OPEN_ITEMS.md` with the full finding and a recommended import mode (Add New Only). |

*A more granular, code-line-cited snapshot of the app (routes, exact field lists, live data checks) is also maintained as a published artifact for ad-hoc deep-dives — ask the current session for the link if needed. This document is the one meant for cross-session/cross-chat continuity and should stay the primary source of truth for "what's built."*
