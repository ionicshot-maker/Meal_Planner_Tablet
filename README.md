# Angelo Family Meal Planner

A personal meal planning PWA for tablet and phone. Plan your week, track nutrition, and generate grocery lists automatically — all in one place, offline-capable, with no subscription required.

**Live app:** https://angelo-meal-planner.netlify.app

---

## What It Does

- **Ingredient Database** — Add ingredients once with nutrition facts and brand details. Supports barcode scanning, USDA FoodData Central lookup, and Google Gemini AI lookup for packaged products. Quick-filter by category (Beverages, Meat, Produce, etc.).
- **Cookbook** — Store all your recipes with ingredients, steps, nutrition per serving, and cost. Import recipes from URLs or pasted text using Gemini AI. Tag recipes as Beverages or Homemade for drinks tracking.
- **Meal Planner** — Plan breakfast, lunch, dinner, snacks, and drinks for any week. Supports leftovers, shared meals, and individual assignments per family member.
- **Grocery List** — Auto-generated from your meal plan. Checks off items while shopping. Exports to PDF.
- **Macro Tracker** — Daily nutrition totals from your meal plan. Per-person goals with progress tracking. Log meals, snacks, and drinks. Separate Drinks section below Snacks.
- **Cloud Sync** — Sync your data across devices using a free Supabase database. Household Sync keeps all your devices in sync. Family Share lets you share recipes (without prices) with family in other homes.
- **Help System** — Built-in help page with guides for every feature, step-by-step setup instructions, accordion FAQ, and troubleshooting.
- **Settings** — Household name, people profiles with individual goals, unit system, optional integrations (USDA, Gemini, Supabase), data export/import, cloud sync.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + TypeScript 5 (strict) |
| Build | Vite 5 |
| Styling | CSS Modules + CSS custom properties |
| Database | IndexedDB via `idb` |
| Cloud Sync | Supabase (`@supabase/supabase-js`) |
| PWA | vite-plugin-pwa + Workbox |
| Hosting | Netlify (static site + serverless functions) |
| Serverless | Netlify Functions (TypeScript, built by Netlify esbuild) |

---

## Project Structure

```
src/
  pages/
    Ingredients/      - Ingredient list and editor
    IngredientImport/ - Barcode scan, USDA, Gemini, bulk entry
    Cookbook/         - Recipe list and editor
    MealPlanner/      - Weekly calendar
    MacroTracker/     - Daily nutrition log (includes Drinks section)
    GroceryList/      - Shopping list
    Settings/         - App configuration + setup checklist + cloud sync
    Help/             - Built-in help system
    Setup/            - First-run wizard
  components/
    ui/               - Shared UI components (Button, Card, Input, etc.)
    layout/           - AppLayout with sidebar navigation
  context/            - Settings and theme providers
  db/                 - IndexedDB access layer + Supabase sync client
  types/              - TypeScript type definitions
  utils/              - Shared utilities (AI import, IDs)

netlify/
  functions/
    barcode-lookup.ts        - Proxy for Open Food Facts API
    usda-search.ts           - Proxy for USDA FoodData Central API
    gemini-nutrition.ts      - Proxy for Google Gemini AI (nutrition lookup)
    gemini-recipe-import.ts  - Proxy for Google Gemini AI (recipe import)
```

---

## Development

### Prerequisites
- Node.js 18+
- Netlify CLI (`npm install -g netlify-cli`)

### Setup

```bash
git clone <repo-url>
cd Meal_Planner_Tablet
npm install
```

### Run locally (with Netlify functions)

```bash
netlify dev
```

This starts the Vite dev server and the Netlify function emulator together. The app runs at `http://localhost:8888`.

### Build

```bash
npm run build
```

### Deploy to Netlify (production)

```bash
# If behind a corporate proxy that inspects SSL:
NODE_TLS_REJECT_UNAUTHORIZED=0 netlify deploy --prod --dir dist

# Otherwise:
netlify deploy --prod --dir dist
```

---

## Optional API Keys & Services

The app works without any external services. These unlock additional features:

### USDA FoodData Central (free)
Used for looking up nutrition facts for raw ingredients like produce, meat, and grains.

1. Go to https://fdc.nal.usda.gov/api-guide
2. Click "Request an API Key"
3. Enter your name and email
4. Check your email for the key
5. In the app: Settings → Integrations → USDA API Key

### Google Gemini AI (free)
Used for:
- Nutrition lookup for packaged/branded products (Import Ingredients → Gemini Lookup)
- Automatic recipe import from URLs and pasted text (Cookbook → Import)
- Barcode fallback when Open Food Facts has no nutrition data

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key" → "Create Project"
4. Copy the key that appears (starts with `AIzaSy`)
5. In the app: Settings → Integrations → Google Gemini API Key

### Supabase Cloud Sync (free)
Used for syncing your data across devices and sharing recipes with family.

1. Go to https://supabase.com and create a free account
2. Create a new project
3. In Project Settings → API, copy the Project URL and anon public key
4. In the app: Settings → Integrations → Supabase Project URL + Anon Key
5. In the app: Settings → Data → Cloud Sync → run the database setup SQL
6. Set a Household Sync Code and tap Sync with Cloud

See [GETTING_STARTED_KEYS.md](GETTING_STARTED_KEYS.md) for step-by-step details.

---

## Data Storage

All data is stored in IndexedDB on the user's device. Data sent externally:
- Open Food Facts (barcode lookups) — via `barcode-lookup` Netlify function
- USDA FoodData Central (ingredient search) — via `usda-search` Netlify function
- Google Gemini AI (nutrition lookup) — via `gemini-nutrition` Netlify function — only if a key is configured
- Google Gemini AI (recipe import) — via `gemini-recipe-import` Netlify function — only if a key is configured
- Supabase (cloud sync) — only if configured; syncs ingredients, recipes, meal plans, grocery lists. Personal macro logs and preferences never leave the device.

API keys are stored locally in IndexedDB and passed to Netlify functions per-request. They are never stored on Netlify's servers.

### Backup and Transfer

Export your data from Settings → Data → Export. This produces a JSON file. To restore, go to Settings → Data → Import.

To move data between devices (e.g., phone → tablet):
- **Option 1 (manual):** Export on source → save to OneDrive → Import on destination
- **Option 2 (cloud sync):** Set up Supabase and use Settings → Data → Cloud Sync → Pull from Cloud

---

## PWA Installation

The app is a Progressive Web App. To install it:

- **iPhone/iPad:** Open in Safari → tap Share → Add to Home Screen
- **Android:** Open in Chrome → tap the three-dot menu → Add to Home Screen
- **Windows/Mac:** Open in Chrome → click the install icon in the address bar

Once installed, the app works offline and updates automatically when a new version is deployed.

---

## License

Personal use. Built for the Angelo family.
