# Starter Ingredient Library — Audit

*Research only, 2026-07-23. No code changes made. Every claim below is cited to a specific file/line, read directly from the current source.*

---

## 1. Where the data lives

**`src/db/starterLibrary.ts`** — a hardcoded TypeScript array literal, `const DEFS: IDef[]` (lines 35–219). Not a JSON file, not a Supabase table, not fetched at runtime from anywhere. It's compiled directly into the app's JS bundle like any other source code.

It uses a compact, hand-authored shorthand format — two local interfaces defined at the top of the same file (lines 5–18):

```ts
interface VDef {
  brand: string
  sz: number; su: string; du: string          // servingSize, servingUnit, defaultUnit
  cal: number; pro: number; carb: number       // macros, abbreviated
  fib: number; sug: number; fat: number; sod: number
  sf?: number; fdc?: number                    // saturatedFat, USDA FDC ID — both optional
}

interface IDef {
  name: string
  cat: string
  peri?: boolean                                // perishable
  variants: VDef[]
}
```

A `build()` function (lines 223–257) expands each shorthand `IDef` into a real `Ingredient` object (with generated UUIDs, a nested `macros: {}` object per variant, etc.) at seed time — the shorthand only exists in this one file; nothing else in the app ever sees the abbreviated shape.

---

## 2. How many ingredients are in it right now

**101 ingredients, 113 variants total** (counted programmatically from the `DEFS` array — most ingredients have exactly 1 variant, a handful have 2–3, e.g. Ground Beef has 4 fat-percentage variants, Milk has 3).

The exported constant `STARTER_INGREDIENT_COUNT = DEFS.length` (line 221) is what the UI displays — currently **101**, always kept in sync with the array by construction (not a separately-maintained number).

Covers 10 categories: Meat & Poultry, Seafood, Eggs, Dairy, Produce, Baking & Pantry, Seasonings & Spices, Bread & Bakery, Condiments & Sauces, Beverages (this exact list is also hardcoded separately in the prompt UI — see `StarterLibraryPrompt.tsx` line 96 — so if you ever add a starter item in a *new* category, that chip list needs a manual update too, it's not derived from `DEFS`).

---

## 3. What triggers it, and what actually happens

**Component:** `src/components/StarterLibraryPrompt.tsx`, mounted in `App.tsx` alongside `SetupWizard` and `CloudSyncPrompt` (outside the router, so it's live on every route once mounted — gated by `settings.setupComplete` before it mounts at all).

**On mount, a `useEffect` (lines 19–48) runs once** (guarded by a `checked` ref so it never re-runs) and checks IndexedDB directly — **no Supabase involved at any point in this flow.** It calls `getAllIngredients(false)` (a local `src/db/ingredients.ts` read) and branches three ways:

1. **Legacy flat-seeded entries found** (old single-"Generic"-variant versions of specific names like `'Chicken Breast (Raw)'`, `'Ground Beef (80/20)'`, etc. — the exact list is `LEGACY_FLAT_NAMES`, lines 21–32) → shows a "migrating…" toast, silently deletes those old entries and re-seeds the current multi-variant versions in their place (`migrateStarterLibrary()`, lines 272–284), no user interaction at all.
2. **Ingredient list is completely empty** → **silently auto-seeds with no prompt shown to the user at all** (line 39–41). A brand-new install with zero ingredients never sees the modal — it just wakes up with 101 ingredients already there.
3. **Otherwise** (some ingredients exist, not already seeded) → shows the actual `Modal` prompt (lines 75–106): "We have a pre-built library of 101 common ingredients... Load 101 Ingredients" / "Skip".

**If the user taps "Load N Ingredients"** (`handleLoad`, lines 50–56): calls `seedStarterLibrary()` (lines 259–270 in `starterLibrary.ts`), which:
- Reads all existing ingredients (`getAllIngredients(true)` — `true` includes archived ones in the dedup check).
- Builds a case-insensitive `Set` of existing names.
- Loops the 101 `DEFS`, and for each one **not already present by name**, calls `saveIngredient()` — a normal per-item IndexedDB write, one at a time, no batching, no transaction wrapping the whole set.
- Sets `starterLibraryVersion: 2, starterLibrarySeeded: true` in settings once done.

**If the user taps "Skip"**: same two settings flags get set (`starterLibrarySeeded: true`) *without* seeding anything — this is why "Skip" is permanent per-device (the prompt won't reappear) rather than "ask me again later."

**Cloud Sync relevance:** none of this talks to Supabase directly. If the household later runs a manual Cloud Sync push, these newly-seeded ingredients go up like any other locally-created ingredient — but the seeding itself is 100% local/IndexedDB.

---

## 4. Does it include brand/store-specific fields, or is it generic?

**Almost entirely generic raw ingredients**, confirmed directly from the `VDef` interface and the `build()` function:

- **No `barcode` field** — the shorthand format has no slot for one, and `build()` never sets it.
- **No `store` / `storePreference` field** — same, not in the shape at all.
- **No `packageCost` / `totalServingsInPackage`** — pricing is never seeded; every starter ingredient starts with zero cost data.
- **No `nutriscore`, `novaGroup`, or `allergens`** — none of these fields exist in `VDef` or get set by `build()`.
- **`brand` field exists, but isn't a real store brand** — it's used as a descriptive variant label: `'80/20 Raw'`, `'Boneless Skinless Raw'`, `'Long Grain Dry'`, or just `'Generic'`. Nothing like "Kraft" or "Great Value" appears anywhere in `DEFS`.
- **`usdaFdcId` (optional `fdc` in the shorthand) is the one "real" cross-reference present** — about half the entries carry a real USDA FoodData Central ID (e.g. `fdc:174036` for 80/20 ground beef), confirming these values were sourced from USDA data, matching what the in-app prompt copy says ("pre-built library... with USDA nutritional data").

**Bottom line:** this is exactly the "chicken breast, raw" style you described — no branded/packaged-product fields exist in the schema at all, so there'd be nowhere for barcode/Nutriscore/Nova/allergen data to go even if you tried to add it to this particular format without extending it first.

---

## 5. Is there a multi-pack selection mechanism already, or would that need building?

**Nothing like that exists today — it would need to be built from scratch.** Concretely, today's architecture is singular at every level:

- **One array**: `DEFS` — not a list of named packs, just one flat list of 101 ingredients.
- **One count constant**: `STARTER_INGREDIENT_COUNT`.
- **One boolean-ish settings pair**: `starterLibrarySeeded: boolean` and `starterLibraryVersion: number` (`AppSettings`, `src/types/index.ts`) — these track "has *the* starter library been seeded/migrated," not "which packs have been seeded." There's no per-pack tracking field.
- **One prompt UI**: a single `Modal` with exactly two buttons (Load / Skip) — no list, no checkboxes, no "choose a pack" step anywhere in `StarterLibraryPrompt.tsx`.
- **One migration path**: `migrateStarterLibrary()` assumes there's exactly one "current" version of the starter set to reconcile against (via `LEGACY_FLAT_NAMES`), not multiple independently-versioned packs.

To offer "Basics" vs. "Branded Products" (or similar) as separate, independently-loadable packs, you'd need at minimum: a second data source (see §6), a settings shape that can track *which* packs are seeded independently (not just one shared boolean), and new selection UI in the prompt (and probably a permanent home in Settings too, since right now there's no way to re-trigger the starter prompt once dismissed except by wiping all ingredients).

---

## 6. What format would be easiest to merge the 867-item OFF file into

**Don't target the `starterLibrary.ts` shorthand format — there's already a better-suited, purpose-built path for exactly this.**

The `DEFS`/`VDef` shorthand (§1) has no fields at all for barcode, Nutriscore, Nova group, allergens, or store/package pricing — real Open Food Facts branded-product data would lose most of its value getting squeezed into that shape, and you'd have to extend `VDef`, `build()`, and the seeding logic just to stop throwing that data away.

Instead, the app already has a dedicated **JSON Import** path (`Import Ingredients → JSON Import` tab, `JsonImportTab.tsx`) built specifically to accept **"the raw output of an Open Food Facts bulk-converter tool"** — confirmed directly in `src/utils/importNormalization.ts`, which already handles:

- Flat *or* nested macro fields (`rv.calories` vs `rv.macros.calories`) — see `pickMacro()`, lines 69–73.
- `barcode`, `nutriscore` (validated against A–E), `novaGroup` (validated 1–4), `allergens[]` — all first-class fields, lines 11–43 and 92–115.
- Both naming conventions for store/servings: `store` *or* `storePreference`, `totalServingsInPackage` *or* `packageServings` (lines 90–91) — i.e. this was already built expecting exactly the kind of renamed-field OFF converter output your file probably has.
- Real `packageCost`, `costPerServing`, `priceLastUpdated`.
- Accepts either a bare JSON array of ingredient objects, or `{ "ingredients": [...] }` (`extractRawIngredients()`, lines 144–150).

**Concretely, the easiest target shape** is an array of objects like:

```json
{
  "ingredients": [
    {
      "name": "...",
      "category": "...",
      "variants": [{
        "brand": "...",
        "barcode": "...",
        "servingSize": 100, "servingUnit": "g",
        "calories": 0, "protein": 0, "carbs": 0, "fiber": 0, "sugar": 0, "fat": 0, "sodium": 0,
        "nutriscore": "C", "novaGroup": 3,
        "allergens": ["Gluten"],
        "storePreference": "Walmart"
      }]
    }
  ]
}
```

— i.e. essentially the same shape you'd get from Settings → Data → Export, except macro fields can stay flat per variant instead of nested (the normalizer handles either). This already goes through the existing brand-normalization, category-suggestion, and barcode/name duplicate-detection logic that every other import path uses (per `JsonImportTab.tsx`), which the hardcoded `starterLibrary.ts` path does *not* have at all (`seedStarterLibrary()`'s only dedup check is an exact case-insensitive name match, line 264).

**One open question for you to decide, not something I can determine from the code:** whether you actually want these 867 items to be *starter-library-seeded* (auto-offered/auto-loaded for new users the way the current 101 are) or just *imported once* into your own household's database via the existing JSON Import tab. Those are different goals — the JSON Import path is the right tool for "get this data into my database now," but it doesn't plug into the `StarterLibraryPrompt` new-user-onboarding flow at all. If you want it offered to *future new users* the way the current 101 are, that's the multi-pack UI work described in §5, using JSON Import's already-correct data model as the source format rather than rewriting it into the `starterLibrary.ts` shorthand.
