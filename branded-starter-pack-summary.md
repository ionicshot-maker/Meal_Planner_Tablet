# Branded Starter Pack — Build Summary

*2026-07-23. Build is clean (0 errors), committed to git (`2c3efb9`), **not deployed** — no deploy was requested this turn.*

---

## 1. Data file location

You said you placed it at `data/Great_Value_Starter_Import.json` — it was actually sitting at the **repo root** (`Great_Value_Starter_Import.json`), not in a `data/` folder. I moved it to **`public/data/great-value-starter.json`**, fetched at runtime rather than bundled into the JS build — at 1.1MB for 867 items, bundling it would have added that weight to every page's initial load for data most users won't ever opt into. `public/` assets are served as-is with no bundle-size impact.

## 2. What was built

| File | What |
|---|---|
| `src/db/brandedLibrary.ts` (new) | `seedBrandedLibrary()` — fetches the JSON, normalizes via the existing `importNormalization.ts` helpers, dedupes, saves. `BRANDED_LIBRARY_COUNT = 867` (shown in the prompt before the file is ever fetched). |
| `src/utils/importNormalization.ts` | Extracted `findIngredientMatch()` (barcode → exact name → fuzzy) out of `JsonImportTab.tsx` into here, now shared by both. Added an opt-out `{ fuzzy?: boolean }` param — see the bug below. |
| `src/pages/IngredientImport/JsonImportTab.tsx` | Now imports the shared `findIngredientMatch` instead of its own local copy. No behavior change (still calls it with fuzzy on, exactly as before). |
| `src/components/StarterLibraryPrompt.tsx` | Extended with the second, independent pack — see flow details below. |
| `src/types/index.ts`, `src/db/settings.ts` | New `brandedLibrarySeeded: boolean` settings flag, device-local (never synced), same convention as `starterLibrarySeeded`. |
| `public/data/great-value-starter.json` | The 867-item file, moved here. |

## 3. How the two-pack prompt behaves

- **101-item USDA set**: completely unchanged trigger logic — silent auto-seed on a truly empty install, same legacy-migration handling, same "prompt if non-empty and undecided" fallback.
- **867-item branded set**: **never** auto-seeds, under any circumstance, including a brand-new empty install — always requires an explicit choice.
- **When only one pack's decision is outstanding**, the prompt shows that pack alone, with the same single-button "Load N Ingredients" / "Skip" presentation the original had (verified byte-identical for the USDA-only case: same title, same button text, no checkboxes).
- **When both are outstanding at once** (e.g. a household that used the app before this pack existed, added some ingredients, but never finished the USDA decision), the prompt shows two checkboxes instead — USDA defaults checked, branded defaults unchecked (it's a much bigger, single-store, more opinionated dataset) — with a unified "Load Selected (N)" / "Skip" button pair. Clicking either resolves both decisions at once.

## 4. Two real bugs found and fixed during verification (not just eyeballed — actually ran the flow)

**Bug 1 — checkbox state wasn't wired to the single-option views.** In single-pack mode (no checkboxes shown), the button click still gated on `usdaChecked`/`brandedChecked` state, which defaults to `false` for the branded pack. Result: clicking "Load 867 Ingredients" on the branded-only prompt silently did nothing. Fixed — in single-option mode, the button click itself is now treated as unconditional "yes" for that one pack, matching the original single-button semantics; checkbox state only gates behavior when both packs are actually shown together.

**Bug 2 — fuzzy name matching false-positived against the generic set.** Reusing `findIngredientMatch()` with its default fuzzy fallback caused roughly half the 867 branded items (measured: ~330–420 of 867 in testing) to be wrongly treated as duplicates of unrelated short-named USDA generics — "Whole Milk" fuzzy-matched "Milk", "Creamy Peanut Butter" matched "Butter", etc. That directly defeated the "offered alongside, not merged into" goal. Fixed by adding a `fuzzy` opt-out to the shared matcher and disabling it specifically for the branded pack (barcode + exact-name only). After the fix: 850 of 867 items load correctly against a fresh USDA-seeded install (17 legitimate skips via real barcode/name matches, not false positives).

## 5. Verification performed

Ran the actual app in a real browser (Playwright against the dev server) across three scenarios, reading real IndexedDB state via the app's own `getAllIngredients()` module (not just visual checks):

- **Fresh empty install**: confirmed USDA silently auto-seeds (101 items, no modal for it) while the branded modal still appears on its own and correctly requires an explicit click; loading it added 850/867 items.
- **Both packs outstanding** (simulated a pre-existing household that never decided on USDA): confirmed the unified checkbox modal appears, checkbox defaults are correct (USDA on, branded off), and selecting only the branded checkbox seeds only the branded pack while correctly resolving both flags.
- **Regression check** (branded already resolved, USDA still outstanding): confirmed the modal renders exactly as the original single-pack version always did — no checkboxes, identical title, identical "Load 101 Ingredients" button text — and seeding still works.

One real methodology trap I hit and want to flag rather than gloss over: my first two verification passes wrongly reported the branded seed as silently failing. Both false alarms traced back to my own test script, not the app — a stale/misleading `indexedDB.open()` read in one case, and a `waitForFunction` checking for one specific modal title string in the other (which legitimately changes mid-operation once the USDA half of a dual selection resolves). Re-verified against the app's own module functions once I found the actual cause; the underlying feature was correct throughout.

## 6. Documentation updated

- **Help page** (`#ingredients` section): added a bullet describing both starter packs — was previously undocumented in Help at all (grepped for "101" and "starter" — zero prior mentions).
- **Settings copy** (`CloudSyncSection.tsx`, duplicate-resolution explanation): updated from "likely from the starter ingredient library seeding on multiple devices" to name both packs generically, since loading either independently on two devices before syncing can produce the same kind of duplicate.
- **`MealPlannerApp_Reference.md`**: bumped to v2.2, dated 2026-07-23. Section 2 (First-Run Experience) rewritten with a full comparison table of the two packs (data source, settings flag, auto-seed behavior, dedup logic) and the fuzzy-matching bug explained. New Changelog row.

### Every place checked for stale single-pack language (per your ask #9)

| Location | Result |
|---|---|
| `src/pages/Help/HelpPage.tsx` | Had zero mentions of the starter library before — added new coverage (see above), not a "fix" since there was nothing stale, just missing. |
| `src/pages/Settings/sections/CloudSyncSection.tsx` (dup-resolution text) | Updated — was singular ("the starter ingredient library"), now names both. |
| `src/pages/Ingredients/IngredientsPage.tsx` (the "Pre-loaded ingredients use USDA average values…" dismissible banner, gated on `starterLibrarySeeded`) | **Checked, no change needed** — this banner is specifically a USDA-generic-values caveat; it doesn't apply to the branded pack's real packaged nutrition facts, so it's correct to leave it scoped to `starterLibrarySeeded` only. |
| `src/components/layout/PageHelpButton.tsx` (per-page contextual help tooltips) | **Checked, no mention of the starter library existed before or now** — generic page-purpose copy, not pack-specific. |
| Settings page / `SetupChecklist.tsx` | **Checked** — the checklist tracks USDA/Gemini keys and Cloud Sync as "optional" steps but never referenced the starter library by name in either version, so nothing was stale. Worth knowing: there's still no persistent Settings-page control to re-trigger either starter prompt once dismissed (true before and after this change — not a regression, just a pre-existing gap in both packs equally). |
| `src/App.tsx`, `src/components/CloudSyncPrompt.tsx`, `src/types/index.ts` | Only code comments referencing `StarterLibraryPrompt`/`starterLibrarySeeded` by name for gating logic — accurate as-is, no user-facing copy. |

## 7. Not done (flagging, not deciding for you)

- **Not deployed.** Committed locally only — say the word if you want it pushed live.
- The dup-count skips (17 of 867 on a clean run) are all legitimate barcode/exact-name matches, but I haven't inspected which specific items they are — let me know if you want that list.
