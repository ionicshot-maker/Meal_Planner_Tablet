# Documentation & User Guidance Audit — Tier 2, Slice 1: AI/No-Key Configuration Messaging

## Scope and Method

Files investigated: `RecipeImportModal.tsx`, `GeminiTab.tsx`, `ScanLabelTab.tsx`, `AISection.tsx`. All four files, plus `src/utils/aiImport.ts` as the primary shared implementation source these four files depend on, were read fresh and in full at the start of this investigation.

Methodology, applied to every user-facing instructional, setup, warning, explanatory, or guidance statement in these four files related to missing AI keys, AI configuration, Gemini setup, AI-dependent features, or behavior when no AI provider/key is configured — including statements ultimately classified Accurate, not just findings: quote the exact user-facing text verbatim with file/line; trace the relevant implementation and quote the actual governing code; state what behavior actually occurs based on the traced code; make an explicit comparison between the quoted text and the traced behavior; classify as Accurate / Stale / Ambiguous / Missing / Misleading; assign a confidence level (High / Medium / Low) with reasoning for anything below High.

A required cross-consistency review followed the four individual file passes, checking whether the four independently-written "no AI key configured" descriptions agree with each other — contradictions, differing descriptions of what happens with no key, inconsistent setup guidance, inconsistent feature-requirement lists, and wording differences that could leave a user with a different understanding depending on which file they read.

A required self-reconciliation check was performed before finalizing results, re-verifying every quote against what was actually read, confirming no classification was inferred from a similar item elsewhere rather than its own evidence, and explicitly listing remaining uncertainty.

---

## File 1 Findings — RecipeImportModal.tsx

**Statement 1** — Quoted text (`:229-231`): *"Paste a recipe URL and the AI will fetch and extract the recipe automatically. Some sites block outside access — if it fails, copy the page text and use the Paste tab."*

**Implementation** (`aiImport.ts:195-219`, `importRecipeFromUrl`):
```ts
export async function importRecipeFromUrl(url: string, config: AIConfig, geminiModel?: string): Promise<AIRecipeResult> {
  if (config.provider === 'gemini') {
    const res = await fetch('/api/gemini-recipe-import', { ... })
    ...
  }
  // Non-Gemini providers: fetch page client-side and pass text to AI
  const pageText = await fetchPageAsText(url)
  const prompt = `The recipe is from this URL: ${url}\n\nPage content:\n${pageText}`
  const { text: raw, resolution } = await callAI(prompt, config, geminiModel)
```

**Behavior**: For Gemini specifically, the URL fetch happens server-side inside the Netlify function itself. For every other provider (Anthropic, OpenAI, Ollama), the client app fetches the page text first (`fetchPageAsText(url)`), then sends the extracted text — not the URL — to the AI. The AI itself never fetches anything for non-Gemini providers.

**Comparison**: Partial mismatch. "The AI will fetch and extract the recipe automatically" is accurate for Gemini but not literally accurate for Anthropic/OpenAI/Ollama, where the app does the fetching and only the extraction is AI-driven.

**Classification**: Ambiguous.

**Confidence**: High — the code path difference is directly quoted and unambiguous; this is a minor precision gap, not a functional inaccuracy a user would likely notice (the end result — a working URL import — is the same either way).

---

**Statement 2** — Quoted text (`:251-256`, no-AI-configured URL box): *"AI provider required for URL import — Automatically fetching and reading a recipe from a URL requires an AI provider. You can use your free Gemini code — go to Settings → Integrations and enter it in the Google Gemini box. No extra cost, completely free."*

**Implementation** (`aiImport.ts:54-58`, `isRecipeImportAvailable`):
```ts
export function isRecipeImportAvailable(settings: AppSettings): boolean {
  const mainAiReady = settings.ai.provider !== 'none' && settings.ai.apiKey.trim() !== ''
  const geminiReady = Boolean(settings.geminiApiKey?.trim())
  return mainAiReady || geminiReady
}
```

**Behavior**: URL import requires either the main AI Provider configured, or (independently) the standalone Gemini key. The Gemini key genuinely is a valid, sufficient, free path.

**Comparison**: Matches exactly.

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 3** — Quoted text (`:316-319`, no-AI paste tab): *"Paste the recipe text below. We'll show it alongside the recipe editor so you can read the original on the left and fill in the fields on the right."*

**Implementation** (`:446-454`, footer button for this state): `onClick={() => { if (pasteText.trim()) { onManualWithReference(pasteText.trim()); onClose() } }}` labeled *"Use as Reference While I Type →"*.

**Behavior**: Confirmed — pasted text is passed to a manual-reference callback rather than parsed by AI.

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: Medium — the button mechanism is directly confirmed in this file, but the actual side-by-side rendering ("original on the left, fields on the right") happens in `RecipeEditor.tsx`, which is out of this task's scope, so the specific visual layout claim wasn't independently re-verified.

---

**Statement 4** — Quoted text (`:330-335`, no-AI paste hint): *"With a free Gemini code in Settings → Integrations, we can parse this automatically."* with a *"Set up Gemini →"* button.

**Implementation**: Same `isRecipeImportAvailable`/`effectiveRecipeAI` Gemini-fallback logic as Statement 2.

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 5** — Quoted text (`:408-413`, no-photo-key box): *"A free Gemini key is required for Photo import — Reading a recipe from a photo uses Google's Gemini vision AI, which is free to use. Go to Settings → Integrations and enter your Gemini key, or visit the Help page for a step-by-step guide to getting one at no cost."*

**Implementation** (`aiImport.ts:222-232`):
```ts
// Photo import always uses Gemini (vision) regardless of the main AI provider setting.
export function effectivePhotoGeminiKey(settings: AppSettings): string {
  if (settings.geminiApiKey?.trim()) return settings.geminiApiKey.trim()
  if (settings.ai.provider === 'gemini' && settings.ai.apiKey.trim()) return settings.ai.apiKey.trim()
  return ''
}
export function isPhotoImportAvailable(settings: AppSettings): boolean {
  return Boolean(effectivePhotoGeminiKey(settings))
}
```

**Behavior**: Photo import is Gemini-exclusive by design — no fallback to Anthropic/OpenAI/Ollama exists, even if one of those is the configured main provider.

**Comparison**: Matches — "requires a Google Gemini key" is precise, not an overclaim, since it's the one true requirement (no other provider works here).

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 6** — the *"Help — Getting a free Gemini key"* button (`:417-419`): `onClick={goToHelp}` → `navigate('/help')` (`:99-102`).

**Behavior**: Navigates to the bare `/help` route with no `#anchor`, landing at the top of the Help page, not scrolled to the Gemini setup section specifically.

**Comparison**: The button text says "visit the Help page for a step-by-step guide" (not "jump directly to it") — so this doesn't overclaim a direct-anchor link.

**Classification**: Accurate.

**Confidence**: Medium — the text's phrasing is loose enough not to promise a direct scroll-to-section behavior, but a user could reasonably expect one given the button's specific labeling ("Getting a free Gemini key," not just "Help"); this is a soft judgment call on intent, not a clear-cut match/mismatch.

---

## File 2 Findings — GeminiTab.tsx

**Statement 1** — Quoted text (`:133-137`, no-key state): *"Gemini API Key Required — Add a free Google Gemini API key in Settings → Integrations → Google Gemini to use AI-powered nutrition lookup. Gemini is especially useful for packaged products and branded foods."*

**Implementation** (`:90,100-101,111`):
```ts
const hasKey = Boolean(settings.geminiApiKey)
...
async function handleLookup() {
  if (!productName.trim() || !hasKey) return
  ...
  body: JSON.stringify({ ..., apiKey: settings.geminiApiKey, ... })
```

**Behavior**: This tab gates strictly on `settings.geminiApiKey` — the main "AI Provider" setting (Anthropic/OpenAI/Ollama) is never consulted anywhere in this file.

**Comparison**: Matches exactly — the message correctly names the Gemini-specific field, not a generic "AI key."

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 2** — Quoted text (`:182-184`): *"Powered by Google Gemini AI — verify values against the product label before saving."*

**Implementation** (`:104-121`): the fetch call posts to `/api/gemini-nutrition` with `apiKey: settings.geminiApiKey`; the result is passed to `onReview(draft)`, an editable review step (confirmed in this session's earlier Finding #18/#19 work, not re-traced here since out of scope) rather than a direct silent save.

**Comparison**: Matches — genuinely Gemini-powered, and the "verify" instruction is consistent with the fact that this data is not automatically trusted/auto-saved.

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 3** — Quoted text (`:145-147`): *"Enter a product or ingredient name. Gemini AI will return nutrition facts based on the product label. Best for packaged foods and branded products. For whole foods, try the USDA tab."*

**Behavior**: Consistent with the tab's actual purpose (name-based lookup, no barcode/label photo needed) and its `/api/gemini-nutrition` call, which takes only a product name/brand.

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: Medium — the specific recommendation to use "the USDA tab" for whole foods is a UX suggestion not independently re-verified against `USDATab.tsx`'s actual behavior in this pass (out of this task's 4-file scope).

---

## File 3 Findings — ScanLabelTab.tsx

**Statement 1** — Quoted text (`:160-164`, no-key state): *"Gemini API Key Required — Add a free Google Gemini API key in Settings → Integrations → Google Gemini to scan nutrition labels — Gemini reads the photo and extracts the nutrition facts for you."*

**Implementation** (`:110,118`):
```ts
const hasKey = Boolean(settings.geminiApiKey)
...
const result = await scanNutritionLabel(dataUrl, settings.geminiApiKey, settings.geminiModel || GEMINI_PRIMARY_MODEL)
```

**Behavior**: Same pattern as GeminiTab — gates strictly on `settings.geminiApiKey`, ignores the main AI Provider setting entirely.

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 2** — Quoted text (`:174-177`): *"Take or upload a photo of a nutrition facts label. Crop tightly to just the nutrition facts panel for the best read — handy for packaging with several products on it."*

**Behavior**: Consistent with the `PhotoCaptureCrop` component being rendered directly below with matching tip text (`TIPS` array, `:87-93`, e.g. "Crop tightly to just the nutrition facts panel for best results").

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: Medium — the internal `PhotoCaptureCrop` component's actual cropping behavior is not itself part of this file and wasn't re-traced in this pass.

---

**Statement 3** — Quoted text (`:200-205`, low-confidence state): *"We could not read this nutrition label clearly. — Try cropping tighter to just the nutrition facts panel, or make sure the label is well lit and in focus."*

**Implementation** (`:120-129`): `if (result.status === 'low-confidence' || !result.nutrition) { setLowConfidenceReason(result.reason ?? 'The label was unclear.'); setStage('lowConfidence') }`.

**Comparison**: Matches — the UI state is driven directly by the traced result status.

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 4** — Quoted text (`:132-134`): success/warning notice messages: *"Label scanned successfully — please verify before saving."* / *"Some values could not be read — please verify highlighted fields against the label before saving."*

**Implementation**: `uncertainFields.size === 0 ? {...success...} : {...warning...}`, both consistently instructing verification regardless of outcome.

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: High.

---

## File 4 Findings — AISection.tsx

**Statement 1** — Quoted text (`:56`, `PROVIDER_HINTS.none`): *"AI features disabled. You can still enter recipes manually."*

**Implementation** — cross-file, traced directly:
```ts
// aiImport.ts:54-58
export function isRecipeImportAvailable(settings: AppSettings): boolean {
  const mainAiReady = settings.ai.provider !== 'none' && settings.ai.apiKey.trim() !== ''
  const geminiReady = Boolean(settings.geminiApiKey?.trim())
  return mainAiReady || geminiReady
}
```
Plus `GeminiTab.tsx:90` and `ScanLabelTab.tsx:110`, both `const hasKey = Boolean(settings.geminiApiKey)` — neither reads `settings.ai.provider` at all.

**Behavior**: Setting the "Provider" dropdown to "None — manual entry only" does not actually disable AI features if `geminiApiKey` (a separate field, on the same Settings page, directly below this dropdown) is filled in: recipe import via URL/paste-text remains fully available (via `effectiveRecipeAI`'s independent Gemini fallback), and Gemini Lookup / Scan Label remain fully available (neither reads `ai.provider` at all).

**Comparison**: Direct mismatch. "AI features disabled" is not true whenever a standalone Gemini key is present, regardless of this dropdown's value.

**Classification**: Misleading.

**Confidence**: High — every consulted code path is quoted directly above; the independence of the Gemini key from `ai.provider` is unambiguous and structural, not an edge case.

---

**Statement 2** — Quoted text (`:57`, `PROVIDER_HINTS.anthropic`): *"Requires an Anthropic API key. Used for recipe import and ingredient parsing."* vs. (`:59`, `PROVIDER_HINTS.openai`): *"Requires an OpenAI API key."* (no "ingredient parsing" mention).

**Implementation**: `aiImport.ts`'s `callAI()` (`:95-159`) treats Anthropic and OpenAI identically in structure — both are proxied through a dedicated Netlify Function (`/api/anthropic-recipe-import`, `/api/openai-recipe-import`) and both are only ever invoked from `importRecipeFromText`/`importRecipeFromUrl`. No code within `aiImport.ts` shows any Anthropic-specific "ingredient parsing" capability distinct from OpenAI's.

**Comparison**: Cannot confirm or deny within this task's 4-file scope — a genuinely separate "ingredient parsing" feature may exist elsewhere in the codebase (e.g., `RecipeEditor.tsx`, out of scope) that is provider-aware in a way `aiImport.ts` doesn't show, or this asymmetry between the two hint strings may simply be inconsistent copywriting.

**Classification**: Ambiguous.

**Confidence**: Low — this specific claim requires evidence outside this task's approved scope to resolve either way; flagged explicitly rather than guessed.

---

**Statement 3** — Quoted text (`:174-178`, main AI Provider key-stored notice): *"API key stored locally on this device only. Never sent to any server except your chosen AI provider."*

**Implementation** (`aiImport.ts:98-122`):
```ts
if (provider === 'anthropic') {
  const res = await fetch('/api/anthropic-recipe-import', {
    method: 'POST', ...
    body: JSON.stringify({ text: prompt, apiKey }),
  })
  ...
} else if (provider === 'openai') {
  const res = await fetch('/api/openai-recipe-import', { ... body: JSON.stringify({ text: prompt, apiKey }) ... })
```

**Behavior**: For Anthropic and OpenAI (and for Gemini, when selected as the main provider), the API key is sent over the network to this app's own Netlify Function (a CORS-avoidance proxy, confirmed in this session's earlier #20 investigation), which then relays it to the actual provider — it is not sent directly from the browser to "your chosen AI provider" alone.

**Comparison**: Direct mismatch. "Never sent to any server except your chosen AI provider" is an absolute claim contradicted by the confirmed proxy architecture — the key is transmitted to (though not stored by) this app's own intermediary server first.

**Classification**: Misleading.

**Confidence**: High — the exact `fetch()` calls and their target endpoints are quoted directly above; the proxy pattern's existence for these two providers is unambiguous from this file's own imported `aiImport.ts` code, not an assumption.

---

**Statement 4** — Quoted text (`:204-207`, Google Gemini card description): *"Used to auto-fill nutrition facts for packaged products when barcode data is missing. Free at aistudio.google.com. Fully optional — falls back to USDA search if not configured."*

**Implementation**: No code within this task's 4-file scope shows any automatic Gemini→USDA fallback mechanism. `GeminiTab.tsx` and `ScanLabelTab.tsx` both simply show a "key required" message with zero auto-redirect or auto-suggestion logic when `hasKey` is false — USDA Lookup exists only as a separate, manually-selected tab.

**Comparison**: The specific "falls back to USDA search if not configured" claim describes an automatic behavior not evidenced anywhere in the traced code; it may describe `BarcodeTab.tsx`'s barcode-enrichment logic specifically (out of scope for this task), which was not read in this pass.

**Classification**: Ambiguous.

**Confidence**: Low — the claim may be accurate for a code path this task's scope doesn't cover (`BarcodeTab.tsx`); flagged as unresolved rather than asserted wrong.

---

**Statement 5** — Quoted text (`:247-250`, model-picker hint): *"Not sure which to use? Start with Gemini 3.1 Flash Lite — it has the highest free daily limit (500 requests/day vs. 20/day for Gemini 2.5 Flash and Gemini 3.5 Flash)."*

**Implementation** (`:34-39`):
```ts
const RECOMMENDED_MODEL_BADGES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Recommended — 500/day free',
  'gemini-2.5-flash': '20/day free',
  'gemini-3-flash-preview': 'Preview',
  'gemini-3.5-flash': '20/day free',
}
```
With the code's own comment (`:30-33`): *"Google's discovery endpoint has no rate-limit/pricing-tier field... these badges are curated knowledge that live data can never supply, so they stay hardcoded."*

**Behavior**: The UI text precisely restates this hardcoded constant.

**Comparison**: Matches the implementation exactly.

**Classification**: Accurate (text-matches-code, per this task's methodology).

**Confidence**: High for the text-vs-code match itself. Separate note, not a classification change: this is the identical class of hardcoded, potentially-drifting quota number that was deliberately removed from `HelpPage.tsx` earlier this session specifically because "Google's exact quotas and pricing change over time... rather than restate a number here that could go stale." This file still carries that same risk, unaddressed — flagged prominently in Cross-Consistency Review below since it represents a real inconsistency in how this codebase treats the same category of information in two different places, even though it isn't a text-vs-code mismatch within this file alone.

---

**Statement 6** — Quoted text (`:328-331`, Gemini key-stored notice): *"Key stored locally on this device only. Also used for recipe import when no other AI provider is set."*

**Implementation**: Matches `effectiveRecipeAI()`'s fallback precisely (`aiImport.ts:62-70`).

**Comparison**: Matches — note this claim is narrower and more careful than Statement 3's ("stored locally," not "never sent to any server except the provider"), and doesn't make the same overclaim.

**Classification**: Accurate.

**Confidence**: High.

---

**Statement 7** — Quoted text (`:60`, `PROVIDER_HINTS.ollama`): *"Runs locally — no API key needed. Requires Ollama running on your machine."*

**Implementation** (`:157-172`): the Ollama branch renders only "Ollama Base URL" and "Model" inputs, never an API key field; `aiImport.ts:137-155`'s Ollama branch has no `apiKey` in its request body.

**Comparison**: Matches.

**Classification**: Accurate.

**Confidence**: High.

---

## Cross-Consistency Review

**1. Contradiction found — what "no AI provider" actually means.** `AISection.tsx`'s own `PROVIDER_HINTS.none` text claims *"AI features disabled"* when the dropdown is "None," but `GeminiTab.tsx` and `ScanLabelTab.tsx` — both files in this same slice — gate entirely on `settings.geminiApiKey` and never check `ai.provider` at all. A user could set the Provider dropdown to "None," fill in only the separate Gemini key field (visible on the very same Settings page), and have Gemini Lookup, Scan Label, and Recipe URL/paste import all fully working — directly contradicting the "disabled" framing. This is the single clearest cross-file inconsistency found.

**2. Inconsistent feature-requirement framing between RecipeImportModal and the Gemini-only tabs.** `RecipeImportModal.tsx` frames URL/paste import as needing "an AI provider" generically (any of Anthropic/OpenAI/Gemini/Ollama satisfies it) — consistent with `isRecipeImportAvailable()`. `GeminiTab.tsx`/`ScanLabelTab.tsx`, by contrast, are Gemini-exclusive by construction — no other provider can satisfy their requirement at all. This isn't a contradiction (both are accurate for their own feature), but a user moving between these surfaces could reasonably expect "I already set up an AI provider" to unlock everything, when it only unlocks recipe import, not Gemini Lookup/Scan Label/Photo import specifically. Worth surfacing as a conceptual inconsistency in how "AI is configured" is communicated across the app, even though each individual file's own text is accurate for itself.

**3. Differing security/privacy claims for the same underlying proxy architecture.** `AISection.tsx`'s main-AI-Provider key-stored text (Statement 3 above) claims the key is "Never sent to any server except your chosen AI provider," while the separate Gemini-key-stored text (Statement 6) makes the narrower, accurate claim of "stored locally... used for recipe import." Both keys go through the identical Netlify-Function-proxy architecture, but only one of the two adjacent notices overclaims about network transmission. This inconsistency is worth flagging specifically because the more careful wording (Statement 6) sits right below the less careful one (Statement 3) on the same page.

**4. The "500 requests/day" quota number's cross-document inconsistency.** As noted in File 4/Statement 5: this exact category of hardcoded, provider-supplied quota number was deliberately removed from `HelpPage.tsx` earlier this session, with an explicit rationale recorded in `OPEN_ITEMS.md` about avoiding restating a number that could go stale. `AISection.tsx` still displays the identical style of hardcoded number, defended by its own code comment as a deliberate, unavoidable choice (since Google's API has no live equivalent field). This is not a text-vs-code mismatch, but it is a real product-level inconsistency in how the same underlying risk (a quota number going stale) is handled in two different UI surfaces of the same app.

**5. No inconsistency found in setup instructions themselves.** All four files that reference "how to get a Gemini key" point to the same location (Settings → Integrations → Google Gemini box) with no conflicting instructions.

---

## Consolidated Findings List

| # | File | Statement | Classification | Confidence |
|---|---|---|---|---|
| 1 | RecipeImportModal.tsx | "The AI will fetch and extract the recipe automatically" (URL tab) — true for Gemini only, not Anthropic/OpenAI/Ollama | Ambiguous | High |
| 2 | RecipeImportModal.tsx | "Help — Getting a free Gemini key" navigates to bare `/help`, not a scrolled/anchored section | Accurate (text doesn't overclaim, but a soft judgment call) | Medium |
| 3 | AISection.tsx | `PROVIDER_HINTS.none`: "AI features disabled" — false whenever a standalone Gemini key is set, regardless of this dropdown | **Misleading** | High |
| 4 | AISection.tsx | `PROVIDER_HINTS.anthropic` claims "ingredient parsing" use; `PROVIDER_HINTS.openai` doesn't — asymmetry not resolvable in scope | Ambiguous | Low |
| 5 | AISection.tsx | Main AI key notice: "Never sent to any server except your chosen AI provider" — contradicted by the confirmed Netlify-Function proxy for Anthropic/OpenAI/Gemini | **Misleading** | High |
| 6 | AISection.tsx | Gemini card: "falls back to USDA search if not configured" — no such automatic mechanism found in the traced code within this task's scope | Ambiguous | Low |
| 7 | AISection.tsx | "500 requests/day" / "20/day" hardcoded quota badges — text matches code exactly, but represents the same staleness-risk category already removed elsewhere in this app for that exact reason | Accurate (text-vs-code), flagged separately as a cross-consistency observation | High (for text-vs-code); not a classification of the number's real-world correctness |
| Cross-1 | — | `PROVIDER_HINTS.none` contradicted by `GeminiTab.tsx`/`ScanLabelTab.tsx`'s independent Gemini-key gating | Cross-file contradiction | High |
| Cross-3 | — | Two adjacent key-storage notices in the same file make differently-scoped claims about the same proxy architecture | Cross-statement inconsistency | High |

---

## Self-Reconciliation Check

**1. Re-verification of every quote against what was actually read**: Every quoted string above was copied directly from the `Read` tool's output captured at the start of this task (all four files, plus `aiImport.ts`, read in full in a single batch at the beginning of this pass) — not reconstructed from memory of a prior pass. Line numbers cited match the line numbers shown in that same `Read` output.

**2. Confirmation no quote was miscopied or paraphrased where a direct quote was required**: All bracketed quoted strings above are verbatim substrings of the source files as read; no paraphrase was substituted for a required direct quote. The only text presented as summary rather than quote is explicitly labeled as "Behavior" or "Implementation" (code) rather than as a quoted user-facing statement.

**3. Confirmation every classification is directly supported by evidence for that specific item**: Each classification above cites the specific code block traced for that exact statement, not a classification carried over from a similarly-worded statement elsewhere. The two "Ambiguous/Low" classifications (Statements 4 and 6 in File 4) were explicitly kept at Low confidence rather than inferred from adjacent, better-evidenced findings, since the supporting or contradicting code for those two specific claims lives outside this task's approved 4-file scope.

**4. Explicit remaining uncertainty**:
- **File 4, Statement 2** (Anthropic "ingredient parsing" claim): unresolved — would require reading `RecipeEditor.tsx` or wherever "missing ingredient parsing" is actually implemented, which is out of this task's scope.
- **File 4, Statement 4** ("falls back to USDA search"): unresolved — would require reading `BarcodeTab.tsx`'s barcode-enrichment logic, out of scope.
- **File 1, Statement 3**: the specific side-by-side visual layout claim for the manual-reference paste flow depends on `RecipeEditor.tsx`, not independently confirmed.
- **File 1, Statement 6**: whether a user would reasonably expect the "Help — Getting a free Gemini key" button to jump directly to the relevant section is a judgment call, not a fact directly resolvable from code — presented as Medium confidence, not forced to High or Low.
- No finding in this report was based on an unstated assumption; every Low/Medium confidence item above has its specific missing evidence named explicitly rather than glossed over.

---

## Disposition Status

**Pending disposition review — no classification above has been evaluated for backlog-worthiness, severity ranking, or remediation approach. This section exists as a placeholder to be filled in once that review occurs; do not treat its absence as an oversight.**
