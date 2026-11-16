# Food Intelligence (optional)

Optional enhancement layer. **Meal Planner works fully without it** - these modules return `null` / the
unchanged input when Food Intelligence is not configured, offline, slow or failing.

Files copied from the Food Intelligence repository (`clients/meal-planner/`, the source of truth with the tests):
`foodIntelligenceClient.ts`, `resilient.ts`, `barcodeAdapter.ts`, `groceryEnrichment.ts`, `receiptSubmit.ts`.
Do not edit those here; re-copy. `identity.ts` is Meal Planner-specific (Supabase session -> token + household).

Turn it on in the app: Settings -> Integrations -> Food Intelligence (stored on this device only).
Developer shortcut: build with `VITE_FOOD_INTELLIGENCE_URL` (see `.env.local`, which is git-ignored).

Wired in: `utils/barcodeLookup.ts` (scan), `pages/GroceryList/GroceryGenerator.tsx` (list prices/stores),
`pages/IngredientImport/ReceiptLineReview.tsx` (price feed), `pages/Settings/sections/FoodIntelligenceSection.tsx`.
