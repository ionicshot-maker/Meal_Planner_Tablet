# Angelo Family Meal Planner — Open Items

*Last updated 2026-07-24. This is a living checklist the user maintains directly — edit it freely.*

**Security**
- [ ] Rotate Supabase service_role key (deferred while active dev work continues — do before any real household member other than me starts using the app)
- [ ] Run Phase 3 (close legacy household_code bridge) — unblocked now that I'm confirmed real owner

**Data cleanup**
- [ ] Dill Pickle sodium conflict (290mg vs 900mg) — needs a real label check
- [ ] ~31 remaining messy Great Value brand strings (Organic/Walmart/Bakery variants) not yet normalized
- [ ] Reconcile true current ingredient count (has drifted across sessions: 5,698 → 6,125 → 6,121 → 6,129)

**Original pending list**
- [ ] Import USDA comprehensive JSON (366 items) — **file located and pre-verified, import itself still needs to happen.** Found at `C:\Users\ionic\Downloads\usda_comprehensive.json` (not in the repo). Verified: valid JSON, correct `{version, exportDate, source, ingredients: [366]}` shape, 0 internal duplicate names, 0 missing names/variants, all 12 categories used are exact matches to the app's real category list, the 3 all-zero-calorie items (Baking Soda, Water, Sparkling Water) are legitimately zero-cal, not a data error. Variants use flat macro fields (`variant.calories` etc., not nested `variant.macros.{}`) — confirmed this is a *supported* shape, not the historical flat-macros bug: `normalizeVariant()`/`pickMacro()` in `importNormalization.ts` correctly promotes flat fields into the proper nested shape on import, so this file is safe to import as-is. **Why Claude couldn't finish this:** ingredient data lives only in browser-local IndexedDB — no server-side write path exists (no Supabase credentials this session either, so no "write to cloud, sync down" workaround). Actually importing requires opening Import Ingredients → JSON Import in a real signed-in browser session and dropping the file in — only you can do that step. Recommended: **Add New Only** mode (not Add+Update or Replace) — duplicate detection is barcode→exact-name→fuzzy-name and this file's items are simple generic names likely to overlap with the original 101-item USDA starter pack already loaded, so Add New Only should correctly skip existing ones and add only what's genuinely new.
- [ ] Export Cookbook + Ingredients for bulk recipe-ingredient linking

**Feature gaps (known, undecided)**
- [ ] TDEE/BMR calculator for Macro Tracker
- [ ] Unify the 3 separate ingredient-matching implementations (Receipt Scanner / JSON Import / branded pack) — while investigating a Receipt Scanner produce-matching question (see "New ideas" below), confirmed Receipt Scanner's barcode path has its own bespoke checksum/lookup logic (`receiptMatching.ts`) distinct from the other two, reinforcing that these really are 3 independent implementations, not just differently named wrappers around shared logic

**New ideas, not yet scoped**
- [ ] Bill due-date awareness relative to payday (explicitly NOT a budget/amount tracker — just "here's what's due before your next payday," reusing existing payday-schedule infrastructure)
- [ ] Standalone PLU lookup capability for Receipt Scanner produce items — a static IFPS PLU→generic-produce-name table (e.g. `4038` → Raspberries, `4048` → Bananas), no API/network call/schema change needed (resolves to a name/category hint, not a `variant.barcode` match). Found while verifying why Blueberries/Raspberries on a real receipt only got NAME MATCH suggestions despite numeric codes being present: confirmed **by design, but not for this reason** — `isValidBarcodeChecksum()` (`src/utils/barcodeValidation.ts`) hard-rejects anything that isn't exactly 12/13 digits, so a real 4-5 digit PLU code is rejected before ever reaching ingredient lookup; separately, the Gemini extraction prompt (`netlify/functions/gemini-receipt-scan.ts`) describes the `barcodeText` field as "UPC/PLU, typically 11-13 digits" — internally inconsistent, since real PLU codes are 4-5 digits, not 11-13. No PLU-handling logic exists anywhere in the codebase today (confirmed via full-repo search). Not a bug — current behavior is consistent with the existing UPC/EAN-only design — but a real, unbuilt capability gap for a receipt category (produce) that's extremely common.

**Recently completed (for reference, remove once confirmed no follow-up needed)**
- [x] Fixed atomic-transaction gap on Receipt Scanner's household-item writes — `applyIngredientBatch()` (ingredients-only transaction) replaced with `applyReceiptSaveBatch()`, one IndexedDB transaction spanning `ingredients` + `householdItems` + `processedReceipts`. Build-verified; deployed to production and confirmed live by fetching the exact production bundle and grepping for the new transaction code. Not click-verified live (no browser access this session) — logic mirrors the already-working single-store version, just extended to 3 stores (a standard IndexedDB guarantee, not new behavior to prove out).
- [x] Fixed mergeIngredients() category reconciliation — added an optional `{ category }` param; when the two merging ingredients disagree on category, both merge UIs (Barcode Duplicate Finder, Ingredients page) now show a simple dropdown to pick which one survives, instead of always silently keeping whichever the "keep" record happened to have. Build-verified, logic-verified against mock data (4/4 checks incl. back-compat with no option passed), deployed and confirmed live via bundle fetch. Not click-verified live.
- [x] Overnight Claude-for-Chrome price lookup — status checked, confirmed done
- [x] "Add at least one person profile" setup step — confirmed complete
- [x] Ingredient Converter v5 — fixed leading-zero barcode stripping at both the row-parsing and pandas dtype-inference layers
- [x] Barcode Duplicate Finder built in Dev Tools, live-verified against real data
- [x] Merge/Keep/Skip/Delete actions for duplicate ingredients — general mergeIngredients() capability, verified with a real positive-repoint test (1 recipe successfully repointed) and a real negative test (unrelated ingredient correctly returned 0/0/0)
- [x] Fixed a real gap found during this work: grocery list references were never repointed by any prior merge/dedup logic — now fixed
- [x] Dev Tools access control — fixed case-sensitivity bug in owner detection, then removed an over-broad fallback that reopened a security hole
- [x] All 8 leading-zero barcode duplicate pairs resolved (5 merged interactively, final 3 documented in TEST_FIXTURES.md then merged manually)
