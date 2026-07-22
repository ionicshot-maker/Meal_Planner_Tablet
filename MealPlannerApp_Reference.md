# Meal Planner App — Complete Reference

**Version 2.2 — 2026-07-23**

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
- **Receipt Scanner** — photograph a grocery receipt; per-line price/quantity parsing (deterministic math, not AI arithmetic) + fuzzy ingredient matching with confidence tiers; three-way per-line choice (Add as Ingredient / Add as Household Item / Don't Add); a nutrition fallback chain (auto barcode lookup → photograph the product label → on-demand Gemini web search with independently-verified confidence) fills in nutrition for brand-new items created this way.
- **Bulk Entry** — manual spreadsheet-style table, no AI.
- **JSON Import** — accepts this app's own export format or an Open Food Facts bulk-converter format; three import modes (Add New Only / Add + Update Existing / Replace).

---

## 6. Cookbook / Recipe Book

**Per-recipe fields:** name, multi-group tag system (Protein, Cook Method, Cuisine, Source, Type, Extras — user-managed per group), linked ingredient list with quantity/unit/serving-display, numbered reorderable steps, optional notes, Prep + Cook Time (flexible text input, e.g. "90 min" auto-corrects to "1 hr 30 min"), Favorites, Templates (save-as-template, clone into an editable copy), one optional photo (2MB limit, plus drag-drop/clipboard-paste support), recipe source (URL/name), auto-calculated macros and estimated cost per serving.

**Verified Serving Count:** a checkbox the user checks after actually cooking and portioning a recipe — unverified recipes show an amber "not verified" warning since per-serving nutrition is only as good as the serving count.

**Recipe pricing completeness:** estimated cost only displays when *every* linked ingredient has a package cost — otherwise the app shows "missing pricing for N ingredients" instead of a silently-wrong partial total.

**Missing ingredient handling:** a recipe ingredient line can be "unlinked" (display-text only, excluded from macro/cost calculation) — the editor warns before saving if any lines are unlinked.

**Recipe scaling:** change the serving count at any time; all quantities, macros, and cost recalculate live.

**Recipe import — three methods:** URL (AI fetches + parses), pasted text (AI parses), and **photo** (AI reads a photographed recipe page — printed or handwritten). All three land in the same editable review screen before saving; manual entry is always available regardless of AI configuration.

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

---

## 12. Data Model — Quick Reference

IndexedDB database `MealPlannerDB`, 11 object stores: `settings`, `ingredients`, `recipes`, `mealPlanDays`, `mealPlanTemplates`, `macroLogs`, `groceryLists`, `householdItems`, `collections`, `references`, `processedReceipts`. Full field-level type definitions live in `src/types/index.ts` — this document intentionally doesn't duplicate them field-by-field to avoid drifting out of sync with the actual types; check there (or the more detailed code-verified snapshot referenced in Section 15) for exact shapes.

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

*A more granular, code-line-cited snapshot of the app (routes, exact field lists, live data checks) is also maintained as a published artifact for ad-hoc deep-dives — ask the current session for the link if needed. This document is the one meant for cross-session/cross-chat continuity and should stay the primary source of truth for "what's built."*
