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
- [ ] Import USDA comprehensive JSON (366 items)
- [ ] Check status of overnight Claude-for-Chrome price lookup (47 priced as of original session start)
- [ ] Export Cookbook + Ingredients for bulk recipe-ingredient linking

**Feature gaps (known, undecided)**
- [ ] TDEE/BMR calculator for Macro Tracker
- [ ] "Add at least one person profile" setup step still incomplete
- [ ] Unify the 3 separate ingredient-matching implementations (Receipt Scanner / JSON Import / branded pack) — while investigating a Receipt Scanner produce-matching question (see "New ideas" below), confirmed Receipt Scanner's barcode path has its own bespoke checksum/lookup logic (`receiptMatching.ts`) distinct from the other two, reinforcing that these really are 3 independent implementations, not just differently named wrappers around shared logic
- [ ] Fix atomic-transaction gap on Receipt Scanner's household-item writes
- [ ] mergeIngredients() doesn't reconcile category disagreements between merged pairs — kept record's category wins outright with no review step (found while merging the last 3 barcode-duplicate pairs)

**New ideas, not yet scoped**
- [ ] Bill due-date awareness relative to payday (explicitly NOT a budget/amount tracker — just "here's what's due before your next payday," reusing existing payday-schedule infrastructure)
- [ ] Standalone PLU lookup capability for Receipt Scanner produce items — a static IFPS PLU→generic-produce-name table (e.g. `4038` → Raspberries, `4048` → Bananas), no API/network call/schema change needed (resolves to a name/category hint, not a `variant.barcode` match). Found while verifying why Blueberries/Raspberries on a real receipt only got NAME MATCH suggestions despite numeric codes being present: confirmed **by design, but not for this reason** — `isValidBarcodeChecksum()` (`src/utils/barcodeValidation.ts`) hard-rejects anything that isn't exactly 12/13 digits, so a real 4-5 digit PLU code is rejected before ever reaching ingredient lookup; separately, the Gemini extraction prompt (`netlify/functions/gemini-receipt-scan.ts`) describes the `barcodeText` field as "UPC/PLU, typically 11-13 digits" — internally inconsistent, since real PLU codes are 4-5 digits, not 11-13. No PLU-handling logic exists anywhere in the codebase today (confirmed via full-repo search). Not a bug — current behavior is consistent with the existing UPC/EAN-only design — but a real, unbuilt capability gap for a receipt category (produce) that's extremely common.

**Recently completed (for reference, remove once confirmed no follow-up needed)**
- [x] Ingredient Converter v5 — fixed leading-zero barcode stripping at both the row-parsing and pandas dtype-inference layers
- [x] Barcode Duplicate Finder built in Dev Tools, live-verified against real data
- [x] Merge/Keep/Skip/Delete actions for duplicate ingredients — general mergeIngredients() capability, verified with a real positive-repoint test (1 recipe successfully repointed) and a real negative test (unrelated ingredient correctly returned 0/0/0)
- [x] Fixed a real gap found during this work: grocery list references were never repointed by any prior merge/dedup logic — now fixed
- [x] Dev Tools access control — fixed case-sensitivity bug in owner detection, then removed an over-broad fallback that reopened a security hole
- [x] All 8 leading-zero barcode duplicate pairs resolved (5 merged interactively, final 3 documented in TEST_FIXTURES.md then merged manually)
