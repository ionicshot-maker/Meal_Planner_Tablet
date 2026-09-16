# Full-Application Audit — Phase 3: AI / External Integrations

**Completed: 2026-08-01.** Scope: Gemini integrations broadly — model discovery, fallback behavior, AI-assisted imports, recipe workflows, kitchen-reference workflows, nutrition-extraction workflows, and any other external-AI integration. Security/RLS, onboarding, UX consistency, documentation drift, and performance were out of scope except where directly required to answer an AI-integration question. `AUDIT_PHASE0_BASELINE.md`, `AUDIT_PHASE1_DATA_INTEGRITY.md`, and `AUDIT_PHASE2_DATA_MOVEMENT.md` were read in full and treated as established fact — not re-verified. Investigation-only pass — no code changed, no production data modified, no live Gemini calls made that would create real database records, `OPEN_ITEMS.md` not touched, Phase 4 not started.

## Methodology

This area carries the heaviest documented prior-audit weight of any phase so far — the Gemini fallback-literal consolidation, Dynamic Gemini Model Discovery (3 phases), and the Phase 2C-1 scale-inflation fix all happened earlier this same session, not in some prior unrelated conversation. The explicit job here was to *re-confirm* that work still holds today and to find whatever falls outside its boundary, not to rediscover it. Concretely: every one of the 8 Gemini-calling Netlify Functions was re-read (not sampled) for fallback/resolution-reporting wiring; a fresh repo-wide grep for the two consolidated literal strings (`gemini-3.1-flash-lite`, `gemini-3-flash`) was run to catch any new call site added since the consolidation; the exact fix location for the scale-inflation bug (`normalizeDetectionResponse()`) was re-read to confirm it's unregressed; and `src/utils/aiImport.ts` was read in full, which surfaced a class of integration this phase's brief didn't originally name — see below.

---

## AI Integration Point Inventory

**Confirmed: Gemini is not the only external AI integration.** `src/utils/aiImport.ts`'s `callAI()` also calls **Anthropic** and **OpenAI** directly, plus **Ollama** (local), for the "main AI provider" recipe-import path (`AppSettings.ai: AIConfig`, independent of `geminiApiKey`). This is a real, functioning, distinct integration surface that was never part of the Gemini-only consolidation/discovery work (correctly so — that work was scoped to Gemini) but is squarely in this phase's stated scope ("Gemini... or any other external AI service, if one exists beyond Gemini — confirm there isn't"). It does exist, and it is architecturally quite different from the Gemini path — see Findings.

| Integration point | Routes through | Asks Gemini to | Expected response shape | Consolidation coverage |
|---|---|---|---|---|
| Barcode Lookup (OFF fallback) | `gemini-nutrition` (only when OFF has zero macros) | Look up nutrition by product name/brand | `{status, nutrition: {calories, protein, carbs, fiber, sugar, fat, sodium, servingSize?, servingUnit?, category?}}` or `{status:0}` (not found) | **Excluded by design** — the one function without fallback/resolution (fails loud on 404) |
| USDA Lookup | None (no AI) | — | — | N/A |
| Gemini Lookup | `gemini-nutrition` | Same as above | Same as above | Same exclusion as above |
| Scan Label | `gemini-label-scan` | Read a nutrition-facts panel photo | `{status, nutrition, resolution}` or `{lowConfidence, reason}` | ✅ full fallback + resolution |
| Receipt Scanner | `gemini-receipt-scan` | Extract store/date/total/line-items from a receipt photo | `{status, receipt:{store,date,total,items[]}, resolution}` or `{lowConfidence, reason}` | ✅ full fallback + resolution |
| Recipe Import — paste text / URL (Gemini provider) | `gemini-recipe-import` | Parse recipe text or fetch+parse a URL | `{status, recipe, resolution}` | ✅ full fallback + resolution |
| Recipe Import — paste text / URL (Anthropic/OpenAI/Ollama) | Direct client→provider fetch (`aiImport.ts`) | Same, via a shared `SYSTEM_PROMPT` | Raw text, JSON-parsed client-side | **N/A — not Gemini; no fallback, no resolution reporting, hardcoded model per provider** |
| Recipe Import — photo | `gemini-photo-recipe` | Read a recipe photo (vision) | `{status, recipe, resolution}` or `{lowConfidence, reason}` | ✅ full fallback + resolution |
| Recipe Import — crop-another-recipe box detection | `gemini-detect-recipe-boxes` | Find bounding boxes of multiple recipes in one photo | `{boxes:[{leftPct,topPct,widthPct,heightPct}], resolution}` | ✅ full fallback + resolution |
| Kitchen Reference photo scan | `gemini-reference-scan` | Read a kitchen reference page photo | `{status, reference, resolution}` or `{lowConfidence, reason}` | ✅ full fallback + resolution |
| Barcode web lookup fallback | `gemini-barcode-web-lookup` | Grounded web search for nutrition by barcode | `{status, result:{...,confidence:'high'|'medium'|'low'}, resolution}` | ✅ full fallback + resolution |
| Model discovery ("Check available models" / "Browse all models") | Google's `models.list` endpoint, called client-side | List available `generateContent` models | Live model list | ✅ this session's own Phases 1–3 work, re-confirmed below |

No integration point beyond this list and the Anthropic/OpenAI/Ollama surface was found.

---

## Re-Confirmation of This Session's Prior Gemini Work

All re-checked fresh against current code, not assumed from memory:

- **Fallback-literal consolidation**: a fresh repo-wide grep for `gemini-3.1-flash-lite`/`gemini-3-flash` found matches in exactly 5 files — `geminiModel.ts` (the source of truth), `OPEN_ITEMS.md`/`MealPlannerApp_Reference.md` (documentation), `AISection.tsx` (the curated-chip constants, a pre-approved exception), and `PhotoCaptureCrop.tsx` (a code comment, the other pre-approved exception). **No new call site has hardcoded either literal since the consolidation.** Unregressed.
- **Resolution reporting**: re-confirmed via grep that all 7 fallback-capable functions (`gemini-barcode-web-lookup`, `gemini-detect-recipe-boxes`, `gemini-label-scan`, `gemini-photo-recipe`, `gemini-receipt-scan`, `gemini-recipe-import`, `gemini-reference-scan`) import and use `resolveGeminiModel()`/`buildGeminiResolution()`/`GEMINI_FALLBACK_MODEL`, and every one's success response includes `resolution: buildGeminiResolution(primaryModel, usedModel)`. `gemini-nutrition` still imports only `GEMINI_PRIMARY_MODEL` directly, with no fallback/resolution machinery — confirmed still the single, deliberate, documented exception (fails loud on 404 by design). Unregressed, exactly as documented.
- **Client-side default sourcing**: every client call site read in `aiImport.ts` (recipe import text/URL/photo, box detection) passes `model: geminiModel || GEMINI_PRIMARY_MODEL` — the shared default, not a local literal. Unregressed.
- **Dynamic Model Discovery**: `AISection.tsx` still sources the 6 curated chips' `displayName`/availability from `useGeminiModelDiscovery()`'s live data (not the old static array), and "Browse all models" still consumes the same hook's retained result. Not re-tested live in this pass (that's verification work), but the code structure is unchanged from its already-documented, already-live-verified state.
- **Phase 2C-1 scale-inflation fix**: `normalizeDetectionResponse()` (`PhotoCaptureCrop.tsx`) still contains all three documented safeguards verbatim — response-level scale normalization (`isInflated` check dividing by 10 when any coordinate exceeds 100), per-box geometric clamping, and per-box discard when unresolvable. Unregressed.

**Nothing in this list regressed.** This is the expected, honest result given how recently and deliberately this exact area was worked on — this phase intentionally produces more "previously known and already resolved" entries than Phases 1–2 did, per the task's own instruction.

---

## Consistency Across AI Entry Points

- **Confidence communication is consistent within its natural grouping, and the one asymmetry found has a plausible rationale, not an obvious gap.** All four vision/photo-based extraction functions (`gemini-label-scan`, `gemini-receipt-scan`, `gemini-photo-recipe`, `gemini-reference-scan`) use the identical `{lowConfidence: true, reason}` escape hatch for "I can't read this at all," and `gemini-photo-recipe`'s client consumer (`importRecipeFromPhoto()` in `aiImport.ts`) additionally computes per-field `uncertainFields` (name/servings/prep/cook/ingredients/steps) for partial-confidence highlighting. The **text-based** paths (paste-text/URL recipe import via `parseAIResponse()`) have no equivalent uncertain-field concept at all. This is a real asymmetry, but a defensible one: a pasted/URL-sourced recipe retains its original source text for the user to cross-check, while a photo's OCR-style extraction has no such fallback reference — the uncertainty is inherent to the vision step in a way it isn't for text parsing. Classified as explained, not a gap requiring the same treatment everywhere.
- **Two independent "coerce a raw AI object into `AIRecipeResult`" implementations exist** — `parseAIResponse()` (used by text/URL import, shared across all 4 providers) and an inline block inside `importRecipeFromPhoto()` (Gemini-only). They apply similar defensive coercions (`Number(...) || default`, `String(...)`) but are not the same code, and only the photo path produces `uncertainFields`. Not a bug — each fits its own caller's actual needs — but worth noting as bespoke-per-entry-point handling rather than one shared utility, should a future consolidation ever want to unify them.
- **Every Gemini-routed integration correctly reports `resolution` when available**; the 3 non-Gemini providers correctly never claim one (per `aiImport.ts`'s own comment: "other providers never have a fallback to report"). Consistent.

---

## Malformed/Partial Response Handling & Scale-Inflation Recurrence Check

Every one of the 8 Gemini functions was checked for its empty/null/malformed/error handling shape:

- **Network/fetch failure**: all 8 wrap the Gemini `fetch()` call in try/catch. The 7 fallback-capable ones retry once on a 404 against `GEMINI_FALLBACK_MODEL`; `gemini-nutrition` instead surfaces a specific 404 error message telling the user to pick a different model manually — the documented, deliberate design difference.
- **Empty/unparseable response body**: consistently handled. The vision-based functions (`gemini-detect-recipe-boxes`, and by extension the label/receipt/photo-recipe/reference-scan family, all following the same shape) treat an empty `rawText` or a `JSON.parse` failure as a soft "no result" (`{boxes:[]}` for box detection; `{lowConfidence:true}` for the recipe/label/receipt/reference family) rather than a hard error. `gemini-nutrition` is more persistent — it retries once with a simplified prompt before giving up with a 502.
- **Genuine API error (429/401/403/etc.)**: `gemini-nutrition` has the most detailed status-specific messaging (rate-limit, invalid-key, model-not-found each get a tailored message); the other 7 rely on the shared fallback-then-generic-error path. This is an existing asymmetry, not newly introduced, and not a functional gap — `gemini-nutrition`'s extra detail predates the consolidation and was correctly left alone by it.
- **Scale-inflation recurrence check (the specific ask)**: a targeted grep across all 8 functions for percentage/coordinate/bounding-box-shaped fields found exactly **one** integration point that returns spatially-scaled numeric data at all — `gemini-detect-recipe-boxes`' `leftPct`/`topPct`/`widthPct`/`heightPct`. No other integration point returns coordinate, bounding-box, or any other 0-100/0-1000-style scaled value. **This class of bug cannot recur elsewhere because no other integration point shares the data shape that made it possible.** The one place it can occur remains fixed and unregressed (above).

---

## Data-Shape Assumptions Crossing the AI Boundary

The scale-inflation and `variant.barcode` findings were both cases of "the client trusted an AI-supplied value's shape/range without verifying it." A fresh look for the same pattern elsewhere found:

- **`gemini-nutrition`'s macro fields are never runtime-validated as numbers, in either the server or the client.** The server does `JSON.parse(...) as GeminiNutrition` — a compile-time-only TypeScript assertion, not a runtime check — and returns the parsed object as-is (aside from the one `notFound` check and the oz→g heuristic below). The client (`GeminiTab.tsx`) then builds a `Macros` object via `nutrition.calories ?? 0`, `nutrition.protein ?? 0`, etc. — `??` only catches `null`/`undefined`, not a wrong-typed value (a string, `NaN`, or a negative number would pass through unchanged and be persisted). This was not demonstrated live in this pass (constructing a malformed Gemini response would be verification work, and the task explicitly excludes live Gemini calls that create real records) — it's a code-level gap, not an observed failure, but it's the same category of "trusted, not verified" data crossing the AI boundary that produced the scale-inflation and barcode findings.
- **`gemini-nutrition`'s own oz→g heuristic (line 244) is structurally the same pattern as Phase 1's sodium-×1000 heuristic.** It silently rewrites `servingUnit` from `'oz'` to `'g'` whenever `servingSize > 30` and the unit is `'oz'`, reasoning that "realistic food servings in ounces are 1–6 oz." The prompt itself also instructs Gemini to self-apply this same correction, so this is defense-in-depth rather than the sole guard — but it's an unverified numeric-threshold assumption of exactly the same shape as the finding Phase 1 already flagged for `repairSodiumUnitBug()`, just living in the AI-integration layer instead of the repair-function layer. No evidence was found that this has ever misfired; flagged for the same reason Phase 1 flagged its counterpart — a plausible-but-unverified assumption, not a demonstrated bug.
- **Every other integration point's numeric fields** (receipt line prices/quantities/weights, label-scan macros) are explicitly instructed by their prompts to be extracted "exactly as printed" / "do NOT do any arithmetic yourself," and downstream parsing (`receiptPriceNormalization.ts`, already outside this phase's re-investigation scope per Phase 1/2 boundaries) is deterministic math on whatever numbers arrive — the same class of unvalidated-numeric-type risk technically exists there too, but it's structurally identical to the nutrition-lookup case above rather than a new distinct pattern, so it isn't re-itemized separately.

---

## Prompt vs. Code/UI Mismatch Review

- **A genuine instance of the barcode-length pattern was found, distinct from (though closely related to) the already-decided PLU item.** `gemini-receipt-scan`'s prompt tells Gemini: `"barcodeText": ... many receipts print a numeric product code (UPC/PLU, typically 11-13 digits)...` — explicitly describing an 11-digit case as normal and explicitly mentioning PLU. But `isValidBarcodeChecksum()` (the actual downstream validator, per `AUDIT_PHASE1_DATA_INTEGRITY.md`/`OPEN_ITEMS.md`) hard-rejects anything that isn't exactly 12 or 13 digits — an 11-digit value the prompt describes as typical will *always* fail validation and never be treated as a real barcode. **This is not a new bug**: the underlying gap (11-digit/PLU-length codes structurally excluded from barcode matching) is the exact same one `OPEN_ITEMS.md`'s 2026-07-30 investigation already found and explicitly decided not to fix. What's new here is narrower: the prompt's own wording ("typically 11-13 digits") was never updated after that decision to stop describing an always-rejected case as normal/expected. This is a stale-prompt-wording observation, not a functional defect — behavior is unchanged either way — but it's precisely the pattern this task asked to hunt for.
- No other prompt reviewed (recipe-box detection, label scan, reference scan, recipe import, nutrition lookup) was found to make a claim inconsistent with current validation/UI behavior.

---

## Categorized Findings

**Confirmed issue**
1. None found that rises to "confirmed broken in production" — every concrete gap identified in this phase is either a live-boundary trust gap not demonstrated in practice (see Plausible concerns) or a cosmetic prompt-wording leftover (see Prompt review). This phase's job was heavily weighted toward re-confirmation, and the honest result reflects that.

**Plausible concern requiring verification**
2. `gemini-nutrition`'s macro fields (`calories`, `protein`, `carbs`, `fiber`, `sugar`, `fat`, `sodium`) are never runtime-validated as numbers, server-side or client-side — a malformed (wrong-typed, `NaN`, or out-of-range) value from Gemini would flow straight into a persisted `Ingredient.variants[].macros` field uncorrected.
3. `gemini-nutrition`'s oz→g serving-size heuristic (`servingSize > 30 && servingUnit === 'oz'`) is an unverified numeric-threshold assumption structurally identical to Phase 1's already-flagged sodium-×1000 heuristic — no evidence of misfiring found, but the same category of risk.
4. The Anthropic/OpenAI direct-from-browser API calls (`aiImport.ts`) may not function reliably at all if either provider's CORS policy blocks direct browser-origin requests (common for provider APIs not designed for client-side use) — not demonstrated live in this pass (would require a live call with a real key), but the code path itself makes no accommodation for this the way the Gemini path explicitly does ("Route through Netlify function to avoid CORS/key-exposure issues").

**Explained/non-issue**
5. Sync's/import's already-known-and-decided PLU/11-digit-barcode gap re-surfacing here via `gemini-receipt-scan`'s prompt wording — the underlying behavior is unchanged and already a closed decision; only the prompt's own wording is stale.
6. The photo-import-only `uncertainFields` mechanism not existing for text/URL recipe import — a defensible asymmetry (photo OCR lacks the source-text cross-check a pasted/URL recipe retains), not an inconsistency requiring the same treatment.
7. Two independent recipe-object-coercion implementations (`parseAIResponse()` vs. the inline photo-import block) — each fits its own caller correctly; not a functional gap.
8. `gemini-nutrition`'s more detailed per-status-code error messaging vs. the other 7 functions' simpler fallback-then-generic-error path — a pre-existing, deliberate asymmetry predating the consolidation, correctly left alone by it.

**Previously known and already resolved (re-confirmed fresh, no regression)**
9. Gemini fallback-literal consolidation — all 21+7 occurrences still consolidated; no new call site found hardcoding either literal.
10. Every fallback-capable function's `resolution` reporting — still present and correct in all 7; `gemini-nutrition`'s deliberate exception still holds.
11. Dynamic Gemini Model Discovery (curated chips + Browse all models) — still sourcing live discovery data, structurally unchanged.
12. Phase 2C-1's scale-inflation fix (`normalizeDetectionResponse()`'s three safeguards) — still present, unregressed, and confirmed to be the only integration point that could ever need it (no other function returns spatially-scaled coordinate data).
13. The 12/13-digit-only barcode validation limitation and its PLU consequence — already investigated, decided against fixing, and closed in `OPEN_ITEMS.md`; this phase found no new information changing that decision.

**Requires later-phase investigation**
14. Whether `aiImport.ts`'s Anthropic/OpenAI/Ollama surface should be brought under any of the same reliability patterns Gemini now has (server-side proxying, fallback models, resolution reporting) — a product-scoping question, not something to decide in an audit pass.
15. Whether to add runtime numeric validation to `gemini-nutrition`'s response (finding #2) and/or generalize the pattern to other AI-sourced numeric fields.
16. Whether `gemini-receipt-scan`'s prompt wording (finding #5) should be updated for accuracy now that the PLU decision is closed — a documentation/prompt-hygiene item, likely belonging with whichever later phase handles that kind of cleanup.

---

## Recommended Follow-Up Targets for Later Phases

- **Whichever phase covers external-integration reliability/hardening**: the Anthropic/OpenAI direct-browser-call question (finding #4) and whether to extend Gemini-style fallback/proxying to those providers (finding #14).
- **A future data-integrity or AI-response-hardening pass**: runtime validation for AI-sourced numeric fields, starting with `gemini-nutrition` (findings #2, #15) — this is the same class of gap Phase 1 already flagged for `repairSodiumUnitBug()`, just in the AI-response layer.
- **Whichever phase handles documentation/prompt hygiene**: `gemini-receipt-scan`'s stale "11-13 digits" prompt wording (finding #16).

---

*End of Phase 3. No fixes were implemented. No production data was modified. No live Gemini calls were made that would create real database records. `OPEN_ITEMS.md` was not edited. Phase 4 has not been started.*
