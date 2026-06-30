# Angelo Family Meal Planner

A personal meal planning PWA for tablet and phone. Plan your week, track nutrition, and generate grocery lists automatically — all in one place, offline-capable, with no subscription required.

**Live app:** https://angelo-meal-planner.netlify.app

---

## What It Does

- **Ingredient Database** — Add ingredients once with nutrition facts and brand details. Supports barcode scanning, USDA FoodData Central lookup, and Google Gemini AI lookup for packaged products.
- **Cookbook** — Store all your recipes with ingredients, steps, nutrition per serving, and cost. Import recipes from URLs or pasted text using AI.
- **Meal Planner** — Plan breakfast, lunch, dinner, and snacks for any week. Supports leftovers, shared meals, and individual assignments per family member.
- **Grocery List** — Auto-generated from your meal plan. Checks off items while shopping. Exports to PDF.
- **Macro Tracker** — Daily nutrition totals from your meal plan. Per-person goals with progress tracking. Log actual meals eaten.
- **Settings** — Household name, people profiles with individual goals, unit system, optional integrations, data export/import.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + TypeScript 5 (strict) |
| Build | Vite 5 |
| Styling | CSS Modules + CSS custom properties |
| Database | IndexedDB via `idb` |
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
    MacroTracker/     - Daily nutrition log
    GroceryList/      - Shopping list
    Settings/         - App configuration + setup checklist
    Help/             - Built-in help system
    Setup/            - First-run wizard
  components/
    ui/               - Shared UI components (Button, Card, Input, etc.)
    layout/           - AppLayout with sidebar navigation
  context/            - Settings and theme providers
  db/                 - IndexedDB access layer
  types/              - TypeScript type definitions
  utils/              - Shared utilities

netlify/
  functions/
    barcode-lookup.ts   - Proxy for Open Food Facts API
    usda-search.ts      - Proxy for USDA FoodData Central API
    gemini-nutrition.ts - Proxy for Google Gemini AI API
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

## Optional API Keys

The app works without any API keys. These keys unlock faster ingredient lookup:

### USDA FoodData Central (free)
Used for looking up nutrition facts for raw ingredients like produce, meat, and grains.

1. Go to https://fdc.nal.usda.gov/api-guide
2. Click "Request an API Key"
3. Enter your name and email
4. Check your email for the key
5. In the app: Settings → Integrations → USDA API Key

### Google Gemini AI (free)
Used for looking up nutrition facts for packaged/branded products. Also used as a fallback when barcode scans return no nutrition data.

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key" → "Create Project"
4. Copy the key that appears
5. In the app: Settings → Integrations → Google Gemini API Key

See [GETTING_STARTED_KEYS.md](GETTING_STARTED_KEYS.md) for step-by-step screenshots and details.

---

## Data Storage

All data is stored in IndexedDB on the user's device. Nothing is sent to a server except:
- Open Food Facts (barcode lookups) — via the `barcode-lookup` Netlify function
- USDA FoodData Central (ingredient search) — via the `usda-search` Netlify function
- Google Gemini AI (nutrition lookup) — via the `gemini-nutrition` Netlify function — only if a key is configured
- Your chosen AI provider (recipe import only) — if configured in Settings → AI Provider

API keys are stored locally in IndexedDB and passed to Netlify functions per-request. They are never stored on Netlify's servers.

### Backup and Transfer

Export your data from Settings → Data → Export. This produces a JSON file. To restore, go to Settings → Data → Import.

To move data between devices (e.g., phone → tablet):
1. Export on the source device
2. Save the file to OneDrive or Google Drive
3. Open the app on the destination device
4. Settings → Data → Import → choose the file

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
