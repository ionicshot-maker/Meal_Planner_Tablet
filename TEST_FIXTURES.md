# Test Fixtures — Leading-Zero Barcode Duplicate Pairs

## Purpose

These are **real examples** of the leading-zero barcode duplicate bug (see `MealPlannerApp_Reference.md` v2.8/v2.9 — `script.py`'s pre-v5 `row_to_ingredient()` + pandas dtype-inference bug), captured from the actual household database before being cleaned up via the Barcode Duplicate Finder's Merge action.

Each pair below is two ingredient records for the *same real product*, imported twice under two different-looking barcodes — one retained its leading zero, the other lost it during import. They're kept here as reference/known-good test data in case merge, dedup, or barcode-matching functionality needs real test cases again in the future — either to manually re-create the "before" state to exercise `mergeIngredients()` / the Barcode Duplicate Finder / `findLeadingZeroBarcodeDupes()` end-to-end, or to re-import via JSON Import using this data as a template.

This file covers the **last 3 of 8** real duplicate pairs found in the household database on 2026-07-23. The first 5 were merged directly without this data being captured first. Data below was reported by the user directly from the live app (Barcode Duplicate Finder + Ingredients page), not queried by Claude — no live browser or Supabase access was available in the session that wrote this file.

**Status: all 3 pairs below were merged successfully on 2026-07-24**, confirmed by the user directly — a fresh Barcode Duplicate Finder scan afterward showed 0 remaining pairs, and all 3 discarded ingredients (Polish smoked sausages, Beef Broth, Whole Flax Seeds) were confirmed gone from the Ingredients list. All 8 original duplicate pairs are now resolved; the data below reflects the "before" state, kept as a real known-good fixture, not the current state of the live database.

**⚠️ Macro/calorie data was not captured.** The Barcode Duplicate Finder's results view doesn't show macros — capturing them would have required opening each of the 6 ingredients individually. That was skipped as not worth blocking on for this fixture. If exact macros matter for a future use of this fixture, pull current values from the live ingredient (if it still exists) or from Open Food Facts directly (all 6 are Great Value products, sourced from Open Food Facts originally — see the branded starter pack / Ingredient Converter). Everything else below (names, brands, categories, both barcode forms) is accurate as reported directly from the live app.

---

## Pair 1 — Polish Smoked Sausages

| Field | Discarded record | **Kept record** (longer barcode) |
|---|---|---|
| Name | Polish smoked sausages | **All Star Polish Smoked Sausages** |
| Brand | Great Value All Star | Great Value |
| Category | Meat & Poultry | Meat & Poultry |
| Barcode (stripped) | `627735278230` | — |
| Barcode (leading-zero, correct form) | — | `0627735278230` |
| Macros | not captured | not captured |

Category matches on both sides for this pair. Brand text differs ("Great Value All Star" vs. "Great Value") even though both clearly refer to the same product line — the "All Star" qualifier landed in the brand field on the discarded record but in the ingredient name on the kept one.

---

## Pair 2 — Beef Broth

| Field | Discarded record | **Kept record** (longer barcode) |
|---|---|---|
| Name | Beef Broth | **Organic Beef Broth** |
| Brand | Great Value Organic | Great Value |
| Category | Meat & Poultry | **Soups & Broths** |
| Barcode (stripped) | `78742147123` | — |
| Barcode (leading-zero, correct form) | — | `0078742147123` |
| Macros | not captured | not captured |

**Category mismatch** between the two records (Meat & Poultry vs. Soups & Broths) — a real example of a leading-zero duplicate pair that also disagreed on category, not just barcode/brand formatting. `mergeIngredients()` doesn't reconcile this: the kept record's category (Soups & Broths) is simply whatever it already was: the discarded record's category is discarded along with everything else about it. Worth exercising this specific case if merge behavior around mismatched categories is ever tested more deliberately.

---

## Pair 3 — Whole Flax Seeds

| Field | Discarded record | **Kept record** (longer barcode) |
|---|---|---|
| Name | Whole Flax Seeds | **Organic Whole Flax Seeds** |
| Brand | Great Value Organic | Great Value |
| Category | Baking & Pantry | **Rice & Grains** |
| Barcode (stripped) | `78742141602` | — |
| Barcode (leading-zero, correct form) | — | `0078742141602` |
| Macros | not captured | not captured |

**Category mismatch** again (Baking & Pantry vs. Rice & Grains) — same pattern as Pair 2.

---

## Common pattern across all 3 pairs

- Every discarded record's barcode is exactly the kept record's barcode with the leading `0` stripped — the signature `barcodeDuplicateScan.ts`'s `findLeadingZeroBarcodeDupes()` looks for (same digits once leading zeros are stripped, different raw strings).
- Every discarded record carries "Organic"/"All Star" as part of the **brand** field; every kept record carries the same qualifier as part of the **name** instead, with a plain "Great Value" brand. Not something the merge logic uses to decide anything (it never looks at name/brand text — only barcodes), but a consistent enough pattern across all 3 that it's likely a real artifact of two different import passes using two different brand-cleanup conventions, not coincidence.
- 2 of 3 pairs (Beef Broth, Whole Flax Seeds) also disagreed on **category** — a reminder that a barcode-confirmed duplicate can still disagree on other fields, and `mergeIngredients()` makes no attempt to reconcile those; whichever record is "kept" wins on every field outright.
