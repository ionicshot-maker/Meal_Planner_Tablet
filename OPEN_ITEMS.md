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
- [ ] Unify the 3 separate ingredient-matching implementations (Receipt Scanner / JSON Import / branded pack)
- [ ] Fix atomic-transaction gap on Receipt Scanner's household-item writes
- [ ] mergeIngredients() doesn't reconcile category disagreements between merged pairs — kept record's category wins outright with no review step (found while merging the last 3 barcode-duplicate pairs)

**New ideas, not yet scoped**
- [ ] Bill due-date awareness relative to payday (explicitly NOT a budget/amount tracker — just "here's what's due before your next payday," reusing existing payday-schedule infrastructure)

**Recently completed (for reference, remove once confirmed no follow-up needed)**
- [x] Ingredient Converter v5 — fixed leading-zero barcode stripping at both the row-parsing and pandas dtype-inference layers
- [x] Barcode Duplicate Finder built in Dev Tools, live-verified against real data
- [x] Merge/Keep/Skip/Delete actions for duplicate ingredients — general mergeIngredients() capability, verified with a real positive-repoint test (1 recipe successfully repointed) and a real negative test (unrelated ingredient correctly returned 0/0/0)
- [x] Fixed a real gap found during this work: grocery list references were never repointed by any prior merge/dedup logic — now fixed
- [x] Dev Tools access control — fixed case-sensitivity bug in owner detection, then removed an over-broad fallback that reopened a security hole
- [x] All 8 leading-zero barcode duplicate pairs resolved (5 merged interactively, final 3 documented in TEST_FIXTURES.md then merged manually)
