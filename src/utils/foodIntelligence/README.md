# Food Intelligence (optional)

Optional enhancement layer. **Meal Planner works fully without it** - these modules return `null` / the
unchanged input when Food Intelligence is not configured, offline, slow or failing.

These files are copied from the Food Intelligence repository (`clients/meal-planner/`), which is the source
of truth and has the tests (`node --test clients/meal-planner/`). Do not edit them here; re-copy.

Enable: `localStorage.setItem('foodIntelligence.config', JSON.stringify({enabled:true, baseUrl:'https://...'}))`
or build with `VITE_FOOD_INTELLIGENCE_URL`. Disable: `{enabled:false}` or remove the key.

Wired in: `utils/barcodeLookup.ts` (barcode scan) and `pages/GroceryList/GroceryGenerator.tsx` (list enrichment).
