import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import { SYNC_STATE_LABELS as L } from '@/components/layout/syncStateLabels'
import styles from './HelpPage.module.css'

// What each state of the sync status pill means. The labels come straight from the pill itself, so this list can't drift from it.
const SYNC_PILL_HELP: [string, string][] = [
  [`${L.idle.label} · just now`, 'Everything on this device matches the household as of the last check (it says how long ago). This is how it should look most of the time.'],
  [L.syncing.label, 'Sending or receiving changes this very moment. It usually takes a second or two.'],
  [L.offline.label, "This device can't reach the household's server right now. Keep working — your changes are kept and go up by themselves when the connection is back."],
  [L['signed-out'].label, "You aren't signed in, so nothing is being shared. Sign in under Settings → Data → Account."],
  [L['read-only'].label, "Your account can look at everything but not change it. Everyone else's updates still reach you."],
  [L['needs-adopt'].label, 'The app needs an answer from you — either to join the household on a new device, or about a lot of removed items. Tap the pill to see which.'],
  [L.error.label, 'Something went wrong. Open Settings → Data to read what, tap Sync now to retry, and see Troubleshooting if it keeps happening.'],
]

export default function HelpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Deep-link support (e.g. a "Learn more" link from Settings): scroll to the
  // hashed section on load. Only native full-page loads honor #hash natively —
  // client-side route changes need this explicit scroll.
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    el?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const TOC_ITEMS = [
    ['#welcome',            'Welcome'],
    ['#whats-in-the-app',   "What's in the App"],
    ['#getting-started',    'Getting Started'],
    ['#account',            'Signing In & Your Account'],
    ['#cloud-sync',         'Syncing Between Devices'],
    ['#ai-features',        'Photos, Receipts & AI Helpers'],
    ['#api-keys',           'Getting Your Free Keys'],
    ['#ingredients',        'Ingredients'],
    ['#ingredient-info',    'Understanding Your Ingredients'],
    ['#json-import',        'JSON Import'],
    ['#cookbook',           'Cookbook'],
    ['#planner',            'Meal Plan'],
    ['#grocery',            'Grocery List'],
    ['#macros',             'Macro Tracker'],
    ['#drinks',             'Drinks'],
    ['#settings-reference', 'Settings Reference'],
    ['#faq',                'FAQ'],
    ['#troubleshooting',    'Troubleshooting'],
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Help & Guide</h1>
          <p className={styles.subheading}>Everything you need to know, written in plain English.</p>
        </div>
        <PageHelpButton />
      </header>

      <div className={styles.content}>

        {/* Quick navigation */}
        <nav className={styles.toc} aria-label="Page sections">
          <span className={styles.tocLabel}>Jump to:</span>
          {TOC_ITEMS.map(([href, label]) => (
            <a key={href} href={href} className={styles.tocLink}>{label}</a>
          ))}
        </nav>

        {/* ── Welcome ─────────────────────────────────────────────────────── */}
        <section id="welcome" className={styles.section}>
          <h2 className={styles.sectionTitle}>Welcome to Your Meal Planner</h2>
          <div className={styles.welcomeCard}>
            <p>
              This app helps your family plan meals for the week, track what you eat, and build your grocery
              list automatically. You add your ingredients and recipes once — then every week you tap which
              meals you want each day and the app tells you exactly what to buy at the store. No more forgetting
              things or buying the same item twice. Everyone in your home signs in to the same shared copy, so
              the whole household sees the same recipes, plans, and lists on their own phone or tablet.
            </p>
          </div>
        </section>

        {/* ── What's in the app ────────────────────────────────────────────── */}
        <section id="whats-in-the-app" className={styles.section}>
          <h2 className={styles.sectionTitle}>What's in the App</h2>
          <p className={styles.sectionDesc}>The menu (on the side of a tablet, across the top of a phone) takes you to each part.</p>
          <div className={styles.featureCard}>
            <ul className={styles.featureList}>
              <li><strong>🥕 Ingredients</strong> — everything you buy at the store, with its nutrition facts and price. Recipes and grocery lists are built from these. <a href="#ingredients">More</a></li>
              <li><strong>⬇️ Import Ingredients</strong> — the quick ways to add ingredients: scan a barcode, look one up, photograph a label or a receipt. <a href="#ai-features">More</a></li>
              <li><strong>📖 Cookbook</strong> — your recipes, plus collections (like "Weeknight Dinners") and kitchen reference pages (substitution charts, conversions). <a href="#cookbook">More</a></li>
              <li><strong>📅 Meal Plan</strong> — a week at a glance. Tap a day and choose what's for breakfast, lunch, and dinner. <a href="#planner">More</a></li>
              <li><strong>🛒 Grocery</strong> — builds your shopping list from the meals you planned, and lets you check things off in the store. <a href="#grocery">More</a></li>
              <li><strong>📊 Macros</strong> — optional. Daily nutrition totals, and a place to log what you actually ate. <a href="#macros">More</a></li>
              <li><strong>⚙️ Settings</strong> — your household's name and people, units, text size, your free keys, and your account and sync. <a href="#settings-reference">More</a></li>
              <li><strong>❓ Help</strong> — this page.</li>
            </ul>
            <p className={styles.sectionDesc} style={{ marginTop: 'var(--space-3)' }}>
              At the bottom of the menu you'll also see a small status pill that shows whether your changes are shared with the
              rest of the household right now — see <a href="#cloud-sync">Syncing Between Devices</a>.
            </p>
          </div>
        </section>

        {/* ── Getting Started ──────────────────────────────────────────────── */}
        <section id="getting-started" className={styles.section}>
          <h2 className={styles.sectionTitle}>Getting Started</h2>
          <p className={styles.sectionDesc}>Follow these steps in order and you will be up and running in no time.</p>
          <div className={styles.infoBox}>
            <p>
              Before step 3 below, it's worth two minutes to set up a free key or two — they make
              adding ingredients and recipes much faster (auto-filling nutrition facts instead of typing
              them by hand). See <a href="#api-keys">Getting Your Free Keys</a> for exact steps. Everything
              in this app also works completely fine without them — you can always add these later.
            </p>
          </div>
          <div className={styles.stepsCard}>
            {[
              ['⚙️ Set your household name', 'Go to Settings and type your family name, like "The Smith Family". This name appears at the top of the app.'],
              ['👥 Add your family members', 'In Settings → Household, add each person in your home — this is what lets meals and portions be planned per person. (Separate from this, each person who uses the app gets their own login — see Signing In & Your Account.) Nutrition tracking (step 7 below) is a separate, fully optional feature; adding someone here doesn\'t turn tracking on for them.'],
              ['🥕 Add ingredients', 'Go to Ingredients and tap + Add Ingredient. Add everything you cook with. You can also scan barcodes on the Import page — that works right away, no setup required.'],
              ['📖 Add recipes', 'Go to the Cookbook and tap + New Recipe. Type one in by hand, or import automatically from a URL or pasted recipe text — auto-import needs a free AI key set up first (see Getting Your Free Keys below); without one, pasted text still opens as a handy reference to type from.'],
              ['📅 Plan your meals', 'Go to Meal Plan and tap each day to choose recipes for breakfast, lunch, and dinner.'],
              ['🛒 Generate your grocery list', 'Go to Grocery, pick your shopping dates, and tap Generate List. The app figures out everything you need.'],
              ['📊 Track your nutrition (optional)', 'Go to Macros to see your daily nutrition totals and log what you actually ate.'],
              ['🔑 Sign in to share with your household', 'Settings → Data → Account. Use the username and password an owner gave you. After that, everything you do is shared with everyone in your home automatically — see Signing In & Your Account and Syncing Between Devices below. (If you are the very first person, the Account box lets you create the household\'s owner account.)'],
            ].map(([title, desc], i) => (
              <div key={i} className={styles.gettingStartedStep}>
                <div className={styles.stepCircle}>{i + 1}</div>
                <div>
                  <div className={styles.stepTitle}>{title}</div>
                  <div className={styles.stepDesc}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Getting Your Free Keys ─────────────────────────────────────── */}
        <section id="api-keys" className={styles.section}>
          <h2 className={styles.sectionTitle}>Getting Your Free Keys</h2>
          <div className={styles.infoBox}>
            <p>
              This app can use a few outside services to save you typing — looking up nutrition facts
              automatically, or reading a recipe, label, or receipt from a photo. Each one
              needs a free "API key" — a long password-like code that lets the app talk to that service on
              your behalf. Getting one is free and takes about two minutes per service; think of it like
              signing up for a free account on a website, then copying a code from that website into this app.
            </p>
            <p style={{ marginTop: 'var(--space-2)' }}>
              <strong>You do not need any of these to use the app.</strong> Every feature also has a fully
              manual way to do the same thing — these just make it faster. Skip anything you don't want and
              come back to it later; nothing breaks if a key is left blank.
            </p>
          </div>

          {/* USDA */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>🌾</span>
              <div>
                <div className={styles.apiCardTitle}>USDA FoodData Central — Free</div>
                <div className={styles.apiCardSub}>What it's for: auto-filling nutrition facts for fresh foods like chicken, vegetables, and grains, on the USDA Lookup import tab</div>
              </div>
            </div>
            <p className={styles.apiCardBody}>
              A U.S. government nutrition database — free, no strings attached. <strong>If you skip this:</strong> the
              USDA Lookup tab still works using a shared public key, it just has a lower daily limit before it
              temporarily stops responding, which resets the next day.
            </p>
            <div className={styles.apiSteps}>
              {[
                'Open the USDA website in a new tab using the button below.',
                'Click the button that says "Request an API Key".',
                'Type your name and email address in the form.',
                'Check your email for a message from USDA — your code will be inside.',
                'Come back to this app, go to Settings → Integrations, and paste your code in the "USDA API Key (optional)" box.',
              ].map((step, i) => (
                <div key={i} className={styles.apiStep}>
                  <div className={styles.apiStepNum}>{i + 1}</div>
                  <div className={styles.apiStepText}>{step}</div>
                </div>
              ))}
            </div>
            <a href="https://fdc.nal.usda.gov/api-guide" target="_blank" rel="noreferrer" className={styles.openLinkBtn}>
              Open USDA Website in a New Tab →
            </a>
          </div>

          {/* Gemini */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>✨</span>
              <div>
                <div className={styles.apiCardTitle}>Google Gemini — Free (Recommended)</div>
                <div className={styles.apiCardSub}>What it's for: packaged-product lookup, reading nutrition labels/receipts/reference pages from a photo, and recipe import</div>
              </div>
            </div>
            <p className={styles.apiCardBody}>
              Google's AI, used any time this app needs to "read" a photo or understand a product name.
              Free — Google gives every account a daily allowance that resets every day, and the app comes
              with a sensible default model already selected for a generous free allowance. Google's exact
              quotas and pricing change over time and vary by model, so rather than restate a number here
              that could go stale, see{' '}
              <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer">
                Google's own current Gemini rate limits and pricing page
              </a>. <strong>If you skip
              this:</strong> Scan Label, Receipt Scanner, Kitchen Reference photo-scan, and recipe photo import
              won't work at all — those specifically require this key. Gemini Lookup (packaged products) works
              better with it, but has a manual fallback without it. Recipe import (URL or pasted text) needs
              an AI key from <em>somewhere</em> — this Gemini key, or a different provider set in the AI Provider
              box above, either works. Pasted text still opens as a handy manual-reference without any AI key
              configured; URL import has no non-AI fallback and simply won't work without one.
            </p>
            <p className={styles.apiCardBody}>
              <strong>Choosing a model:</strong> In Settings → Integrations, under Google Gemini, you'll see a
              row of suggested models — the default is already picked for you, so most people can leave this
              alone. Tap <strong>"Check available models"</strong> to confirm live, right now, which of these
              are actually enabled for your account (a green checkmark appears next to each one that is). Tap
              {' '}<strong>"Browse all models"</strong> to see Google's complete current model list and pick any
              of them directly, not just the suggested ones — useful if Google releases something new you want
              to try. Both buttons check live with Google and need your Gemini key entered above first, since
              what's available can change over time and differs by account.
            </p>
            <div className={styles.apiSteps}>
              {[
                'Open Google AI Studio in a new tab using the button below.',
                'Sign in with your Google account — the same email you use for Gmail.',
                'Click the button that says "Create API Key" or "Get API Key".',
                'Click "Create Project" and give it any name — it does not matter what you call it.',
                'Copy the long code that appears on the screen. It starts with AIzaSy.',
                'Come back to this app, go to Settings → Integrations, and paste your code in the "Google Gemini API Key (optional)" box.',
              ].map((step, i) => (
                <div key={i} className={styles.apiStep}>
                  <div className={styles.apiStepNum}>{i + 1}</div>
                  <div className={styles.apiStepText}>{step}</div>
                </div>
              ))}
            </div>
            <div className={styles.apiWarning}>
              <strong>Important:</strong> Keep your code private like a password. Do not share it in text messages or email.
              Do NOT turn on billing for this project — keeping billing off keeps it completely free.
            </div>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className={styles.openLinkBtn}>
              Open Google AI Studio in a New Tab →
            </a>
          </div>

          {/* AI Provider */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>🤖</span>
              <div>
                <div className={styles.apiCardTitle}>AI Provider (Settings → Integrations) — Optional, separate from Gemini above</div>
                <div className={styles.apiCardSub}>What it's for: an alternate/upgraded engine for recipe import and missing-ingredient parsing</div>
              </div>
            </div>
            <p className={styles.apiCardBody}>
              This is a second, separate AI setting most people can ignore — the Google Gemini key above
              already powers recipe import on its own. The "AI Provider" dropdown in Settings → Integrations
              lets you swap in a different AI company instead: <strong>Anthropic Claude</strong> or{' '}
              <strong>OpenAI</strong> (both require your own paid account with that company — not free, and
              a separate signup from Gemini), or <strong>Ollama</strong> (completely free, but it runs AI
              software on your own computer, which takes technical setup — not recommended unless you're
              already comfortable installing developer tools). Leave this set to "None" unless you specifically
              want one of these instead of Gemini.
            </p>
          </div>

          <div className={styles.privacyNote}>
            <strong>Keep your codes private.</strong> Treat them like passwords. A code is stored only on the device you typed it into —
            it is never shared with the rest of the household. When you use a feature, it travels through your household's server only to
            make that one request to the service, and the server does not keep it.
          </div>
        </section>

        {/* ── Ingredients ──────────────────────────────────────────────────── */}
        <section id="ingredients" className={styles.section}>
          <h2 className={styles.sectionTitle}>Ingredients</h2>
          <div className={styles.featureCard}>
            <p>
              An ingredient is anything you buy at the store — chicken breast, olive oil, black pepper,
              pasta, Sprite, and so on. Before you can use an ingredient in a recipe, you need to add it
              to your ingredient list first.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Add manually:</strong> Go to Ingredients and tap + Add Ingredient. Fill in the name, category, and optional nutrition info.</li>
              <li><strong>Starter ingredient packs:</strong> The first time you have some ingredients but haven't finished setup, the app offers two optional bundles you can load instantly instead of typing everything by hand: 440 generic USDA basics (raw meats, produce, dairy, grains, seasonings — no brand or price data) and 867 Great Value branded grocery products (real barcodes, package sizes, Nutriscore/Nova ratings, and allergen info where available, sourced from Open Food Facts). They're fully independent — load either, both, or neither, and only items not already in your database get added either way. If you already loaded the smaller, original 101-item USDA set before it grew, you'll be offered just the newly added items the next time you open the app — nothing gets duplicated.</li>
              <li><strong>Scan a barcode:</strong> Tap Import Ingredients in the menu, then tap the Barcode Lookup tab. Tap Scan Barcode with Camera, point your camera at the barcode, and hold steady. The app will find the product automatically.</li>
              <li><strong>Search USDA:</strong> In Import Ingredients, tap the USDA Lookup tab. Type an ingredient name like "chicken breast" to find its nutrition data. Works great for fresh meats, produce, and grains.</li>
              <li><strong>Gemini Lookup:</strong> In Import Ingredients, tap the Gemini Lookup tab. Type a product name like "McCormick Ground Cinnamon" and the AI will fill in the nutrition facts. Great for packaged and branded products.</li>
              <li><strong>Scan Label:</strong> In Import Ingredients, tap the Scan Label tab to photograph a nutrition facts label — take a photo or upload one, then crop tightly to just the nutrition panel (handy when a package shows more than one product) and the AI reads off the values for you. Works on desktop with a webcam and on mobile with the camera.</li>
              <li><strong>Receipt Scanner:</strong> In Import Ingredients, tap the Receipt Scanner tab to photograph a grocery receipt and update ingredient pricing in bulk. Each line is matched against your existing ingredients with a confidence level — high-confidence matches are pre-selected, others ask you to pick the right one or create a new ingredient — and nothing is saved until you review and confirm. You'll be asked for servings-per-package on each item since receipts never print that.</li>
              <li><strong>Bulk Entry:</strong> In Import Ingredients, use the Bulk Entry tab to add many simple ingredients at once by typing them in a list.</li>
              <li><strong>Bulk JSON Import:</strong> Already have a JSON file of ingredients — from a Settings → Data export or an Open Food Facts bulk-converter tool? Go to Import Ingredients → JSON Import, drop the file in, optionally filter to specific brands, and import them all at once. Duplicates are detected automatically using the same smart matching used everywhere else in the app.</li>
              <li><strong>Found a duplicate?</strong> Tap <strong>Merge…</strong> on any ingredient card to search for the other ingredient it's really the same product as, pick which one to keep, and confirm. Every recipe, grocery list, and macro log that referenced the other one is automatically repointed to the one you kept, then it's deleted — this works for any duplicate, however it happened (a typo'd re-entry, two separate imports, a barcode mismatch). If you've run the Ingredient Converter (Dev Tools) and want to check specifically for barcode-related duplicates in bulk, use Dev Tools → Barcode Duplicate Finder (household owner only) instead — it scans everything at once and offers the same Merge action per candidate pair, plus Skip and Delete.</li>
              <li><strong>Always On Hand:</strong> Mark things like salt, pepper, and olive oil as "Always On Hand." The grocery list will never add these items even when recipes use them — because you always have them in the kitchen.</li>
              <li><strong>Beverages filter:</strong> On the Ingredients page, tap the Beverages quick-filter button to see only your drink ingredients.</li>
            </ul>
          </div>
        </section>

        {/* ── Understanding Your Ingredients ──────────────────────────────── */}
        <section id="ingredient-info" className={styles.section}>
          <h2 className={styles.sectionTitle}>Understanding Your Ingredients</h2>
          <div className={styles.featureCard}>
            <p>
              Every ingredient in your database can carry four extra pieces of information beyond
              basic nutrition — a barcode, a Nutriscore grade, a Nova processing group, and allergen
              flags. All four are completely optional.
            </p>

            <h3 id="ingredient-info-barcode" className={styles.subFeatureTitle}>Barcode</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> The UPC or EAN barcode number from the product packaging.</li>
              <li><strong>How it helps:</strong> When you scan a barcode the app checks your local database first — if the product is already saved it links instantly without needing an internet connection or using up your Gemini quota.</li>
              <li><strong>How to add it:</strong> Scan with your camera in the ingredient editor, or it fills in automatically when you import from a barcode scan.</li>
            </ul>

            <h3 id="ingredient-info-nutriscore" className={styles.subFeatureTitle}>Nutriscore Grade (A through E)</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> A European nutritional quality score calculated from the overall nutritional profile of a food.</li>
              <li><strong>A (dark green):</strong> Best nutritional quality — fruits, vegetables, whole grains, lean proteins.</li>
              <li><strong>B (light green):</strong> Good nutritional quality.</li>
              <li><strong>C (yellow):</strong> Average nutritional quality.</li>
              <li><strong>D (orange):</strong> Poor nutritional quality.</li>
              <li><strong>E (red):</strong> Worst nutritional quality — heavily processed foods high in sugar, salt, or saturated fat.</li>
              <li><strong>Important note:</strong> Nutriscore grades foods per 100g, so a food used in small amounts like butter or oil may score low but still be fine in moderation.</li>
              <li><strong>How to use it:</strong> Use it as a quick guide when choosing between similar products — a lower Nutriscore does not mean you can never eat it, just that it is less nutritionally dense.</li>
            </ul>

            <h3 id="ingredient-info-nova" className={styles.subFeatureTitle}>Nova Group (1 through 4 — food processing level)</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> A food classification system developed by researchers at the University of São Paulo that groups foods by how much they have been processed.</li>
              <li><strong>Group 1 (green — Unprocessed):</strong> Foods in their natural state — fresh fruits, vegetables, meat, eggs, milk, plain grains.</li>
              <li><strong>Group 2 (light green — Minimally Processed):</strong> Simple processed foods — canned vegetables, dried fruits, plain yogurt, fresh bread, oils, flour, salt, sugar.</li>
              <li><strong>Group 3 (yellow — Processed):</strong> Foods made by adding salt, sugar, or oil to Group 1 or 2 foods — cheese, cured meats, canned fish, fruits in syrup, salted nuts.</li>
              <li><strong>Group 4 (red — Ultra Processed):</strong> Industrial formulations with many additives — soft drinks, packaged snacks, instant noodles, chicken nuggets, breakfast cereals, flavored yogurts.</li>
              <li><strong>Why it matters:</strong> Research suggests that diets high in Group 4 ultra processed foods are associated with higher rates of obesity, diabetes, and heart disease — regardless of individual nutrient content.</li>
              <li><strong>How to use it:</strong> Use it as awareness, not as a strict rule. Knowing that something is ultra processed helps you make informed choices about how often to include it in your meal planning.</li>
            </ul>

            <h3 id="ingredient-info-allergens" className={styles.subFeatureTitle}>Allergens</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> Common food allergens that have been flagged as present in an ingredient.</li>
              <li><strong>The 12 tracked allergens are:</strong> Gluten, Dairy, Eggs, Nuts, Peanuts, Soy, Fish, Shellfish, Sesame, Celery, Mustard, Sulfites.</li>
              <li><strong>How it helps:</strong> The app will warn you in the meal planner if a planned meal contains an ingredient with a flagged allergen, and recipe cards show all allergens present at a glance.</li>
              <li><strong>Important:</strong> Allergen data comes from product labels or community databases and may not be 100% complete. Always check the actual product label for allergen information, especially for severe allergies.</li>
              <li><strong>How to add:</strong> Toggle allergens on or off in the ingredient editor. When importing from Open Food Facts or a barcode scan, allergens fill in automatically when available.</li>
            </ul>
          </div>
        </section>

        {/* ── JSON Import ──────────────────────────────────────────────────── */}
        <section id="json-import" className={styles.section}>
          <h2 className={styles.sectionTitle}>JSON Import</h2>
          <div className={styles.featureCard}>
            <p>
              If you already have a JSON file full of ingredients — a backup you exported from this
              app, or a file produced by an Open Food Facts bulk-converter tool — you can bring them
              all in at once instead of adding them one by one.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Where to find it:</strong> Import Ingredients → JSON Import tab, or tap the "Import from JSON" link on the Ingredients page header.</li>
              <li><strong>Two accepted formats:</strong> This app's own Settings → Data → Export file, or the raw output of an Open Food Facts bulk-converter tool (a common workflow for pulling many products for one brand at once). Both are read automatically — you don't need to pick which one it is.</li>
              <li><strong>Preview before importing:</strong> After choosing a file, you'll see how many ingredients were found, a brand breakdown, and a preview of the first several items with their name, brand, and calories.</li>
              <li><strong>Filter by brand:</strong> Tap brand chips in the breakdown to import only specific brands from the file — handy when a file has products you don't want.</li>
              <li><strong>Import mode:</strong> Choose <em>Add New Only</em> to skip anything that already exists, <em>Add + Update Existing</em> to also refresh existing ingredients when the imported data is newer, or <em>Replace Existing</em> to overwrite matches unconditionally. This is especially useful when re-importing an updated Open Food Facts file for a brand you've already added.</li>
              <li><strong>Duplicate detection:</strong> Checks barcode match first, then exact name and brand — so re-imports merge in instead of creating copies. Fuzzy near-duplicate matching is intentionally turned off for this import path, to avoid false-positive skips on large files.</li>
              <li><strong>Progress and summary:</strong> A progress bar shows import status on large files, and a final summary reports how many were added, updated, and skipped as duplicates.</li>
            </ul>
          </div>
        </section>

        {/* ── Cookbook ─────────────────────────────────────────────────────── */}
        <section id="cookbook" className={styles.section}>
          <h2 className={styles.sectionTitle}>Cookbook</h2>
          <div className={styles.featureCard}>
            <p>
              Your Cookbook is your personal recipe collection. Every recipe you add automatically calculates
              nutrition per serving and estimated cost based on your ingredient prices.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Add a recipe manually:</strong> Tap + New Recipe, fill in the name, add ingredients from your list, type the steps, and save.</li>
              <li><strong>Import from a website:</strong> Tap Import in the Cookbook. Paste the recipe URL and the AI will extract everything automatically — needs an AI Provider or Gemini key set up first, see <a href="#api-keys">Getting Your Free Keys</a>; there's no non-AI way to auto-extract from a URL. If the site blocks copying, or you don't have a key set up, open the page in your browser, copy the text, and use the Paste Text tab instead.</li>
              <li><strong>Import by pasting text:</strong> In the Import screen, switch to the Paste Recipe Text tab. With an AI Provider or Gemini key set up (see <a href="#api-keys">Getting Your Free Keys</a>), pasted text gets parsed into structured fields automatically. Without one, it still opens as a side-by-side reference so you can type the recipe in by hand.</li>
              <li><strong>Import from a photo:</strong> In the Import screen, switch to the Photo tab to photograph a printed or handwritten recipe (a cookbook page, a recipe card, etc.). Requires a Google Gemini key — see <a href="#api-keys">Getting Your Free Keys</a>. Review every field afterward, since handwriting and page photos are harder to read perfectly than clean text.</li>
              <li><strong>Scale a recipe:</strong> Open any recipe and find the serving size at the top. Change the number and all ingredient amounts adjust automatically.</li>
              <li><strong>Mark as Favorite:</strong> Tap the star icon on any recipe to mark it as a favorite. Filter by favorites to find them quickly.</li>
              <li><strong>Save as Template:</strong> Toggle "Save as Template" when editing a recipe. Templates appear separately and can be copied to create new recipes with the same base.</li>
              <li><strong>Incomplete nutrition warning:</strong> A yellow warning on a recipe means some ingredients are missing from your list or have no nutrition data. Tap the recipe to see which ingredients need attention.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Collections</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> A named folder of recipes you choose — like "Weeknight Dinners" or "Holiday Baking." A recipe can belong to more than one collection.</li>
              <li><strong>How to use it:</strong> Tap the Collections filter in the Cookbook, create a new collection, then add recipes to it from that recipe's menu. Reorder or remove recipes within a collection any time.</li>
              <li><strong>Export as PDF:</strong> Open a collection and tap the export button to generate a printable PDF booklet, with options to include a table of contents, photos, nutrition info, cost, and any matching Kitchen Reference pages at the back.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Kitchen Reference</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> Standalone reference notes that aren't tied to any one recipe — herb/spice substitution charts, pantry staple lists, measurement conversions, cooking terms, or anything else worth having on hand while you cook. Tap the Reference filter in the Cookbook to find these.</li>
              <li><strong>Add one:</strong> Tap + Add Reference, give it a title, pick a content type (Tips, Herbs &amp; Spices, Pantry Lists, Measurements, Charts &amp; Tables, Table &amp; Presentation, Cooking Terms, or Personal Notes), and type or paste your content — or switch to Table mode for anything that's naturally rows and columns.</li>
              <li><strong>Digitize a page with a photo:</strong> Attach a photo of a physical page, then tap "Extract Text with Gemini" to have the AI read it into the title/content/table fields automatically. Requires a Google Gemini key. You'll be asked afterward whether to keep the original photo attached (this can also be set to always/never ask in Settings → Preferences → Kitchen Reference Photos).</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Verified Serving Count</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> A checkbox in the recipe editor labeled "Verified Serving Count" that you check after you've actually made and portioned the recipe.</li>
              <li><strong>Why it matters:</strong> Per-serving nutrition is only as accurate as the serving count. A recipe you typed in but never actually cooked and divided into servings might have an estimated or guessed serving count — the per-serving calories, protein, and cost could be off until you verify it.</li>
              <li><strong>What you'll see:</strong> Recipes that haven't been verified show a subtle amber warning — "Serving count not verified — per-serving nutrition may be inaccurate" — on the recipe card and detail view. Once verified, a green checkmark replaces it.</li>
              <li><strong>How to use it:</strong> Cook the recipe, portion it into the number of servings you actually got, then open the recipe, check the box, and save. If your actual serving count differs from what's saved, update the Total Servings field too.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Recipe Pricing</h3>
            <ul className={styles.featureList}>
              <li><strong>Pricing completeness:</strong> A recipe's Estimated Cost is only shown when every linked ingredient has a package cost entered. If even one is missing, the app hides the estimate and shows "Missing pricing for X ingredients" instead, so you're never looking at a silently-wrong partial total.</li>
              <li><strong>How to fix it:</strong> Add a Package Cost and Servings per Package to the missing ingredient(s) in the Ingredient Database — the recipe's cost display updates automatically the next time you view it.</li>
              <li><strong>Price Last Updated:</strong> Every ingredient variant remembers when its package cost was last changed. When a recipe's pricing is complete, the card and detail view show "Prices Last Updated" using the most recent of those dates across all its ingredients — a quick way to tell if your cost estimate might be stale.</li>
            </ul>
          </div>
        </section>

        {/* ── Meal Plan ─────────────────────────────────────────────────────── */}
        <section id="planner" className={styles.section}>
          <h2 className={styles.sectionTitle}>Meal Planner</h2>
          <div className={styles.featureCard}>
            <p>
              The Meal Planner shows a full week at a glance. Tap any day to add recipes for that day.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Plan a meal:</strong> Tap any day on the calendar, then tap the + button in a meal slot (Breakfast, Lunch, Dinner, or Snacks) to pick a recipe.</li>
              <li><strong>Yellow day header:</strong> A yellow dot means you have not planned all meals for that day yet. Once all slots are filled, it turns green.</li>
              <li><strong>Shared vs. individual meals:</strong> When adding a meal, you can mark it as shared (everyone eats it) or assign it to specific people.</li>
              <li><strong>Side dishes and desserts:</strong> You can add multiple recipes to a single meal slot. The first is the main dish; others are sides or desserts.</li>
              <li><strong>Leftovers:</strong> Tap the + Leftover button in any meal slot to add a quick "Leftover" placeholder — it's a standalone label, not linked to any specific earlier meal, and the grocery list automatically skips it since it has no ingredients of its own to add.</li>
              <li><strong>Templates:</strong> Tap the template button to save the current week as a template you can apply to future weeks.</li>
              <li><strong>Dollar icons:</strong> The $ icon on a day shows the estimated food cost for that day based on your ingredient prices.</li>
            </ul>
          </div>
        </section>

        {/* ── Grocery ──────────────────────────────────────────────────────── */}
        <section id="grocery" className={styles.section}>
          <h2 className={styles.sectionTitle}>Grocery List</h2>
          <div className={styles.featureCard}>
            <p>
              The Grocery page builds your shopping list automatically from your meal plan. You never
              have to write a list by hand again.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Generate a list:</strong> Tap Generate List, choose your shopping start and end dates, and tap Generate. The app adds up every ingredient from every planned meal for those days.</li>
              <li><strong>Always on hand check:</strong> Items marked Always On Hand are automatically excluded from the list — the app knows you already have them.</li>
              <li><strong>Household items:</strong> Tap Add Household Items to add non-food items like paper towels, dish soap, or trash bags to the list.</li>
              <li><strong>Partially bought:</strong> If you already have some of an item (like half a bag of rice), tap it and choose Partially Bought to enter how much you already have. The list will subtract that amount.</li>
              <li><strong>Check off while shopping:</strong> Tap any item to check it off. Checked items move to the bottom of the list.</li>
              <li><strong>Save as PDF:</strong> Tap the PDF button to save a copy of your list that you can print or share.</li>
              <li><strong>Drinks consolidate:</strong> If multiple recipes need the same drink ingredient, the grocery list adds the quantities together automatically.</li>
            </ul>
          </div>
        </section>

        {/* ── Macro Tracker ────────────────────────────────────────────────── */}
        <section id="macros" className={styles.section}>
          <h2 className={styles.sectionTitle}>Macro Tracker</h2>
          <div className={styles.featureCard}>
            <p>
              The Macro Tracker shows your nutrition totals for each day. It is completely optional —
              only use it if you want to track your nutrition.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Simple mode:</strong> See totals for calories, protein, carbs, and fat. No goals, no targets — just a summary.</li>
              <li><strong>Complex mode:</strong> Set nutrition goals for yourself (in Settings → Household → People) and see a progress bar for each nutrient.</li>
              <li><strong>Log a meal:</strong> Tap the + button in any meal section to log what you ate. You can pick from your planned meals or enter it manually.</li>
              <li><strong>Log a drink:</strong> Scroll down to the Drinks section. Tap + to add any ingredient in the Beverages category, or a recipe tagged Beverages.</li>
              <li><strong>Log a meal out:</strong> Tap + Manual Entry and type the name and nutrition numbers directly. No recipe needed.</li>
              <li><strong>Daily summary:</strong> The totals card at the bottom of each day shows your running total for all nutrients.</li>
              <li><strong>Nutrition goals:</strong> In complex mode, go to Settings → Household and edit your person profile to set daily targets for calories, protein, carbs, and fat.</li>
              <li><strong>Weight tracking:</strong> In complex mode, enable weight tracking in your person profile. A weight field appears at the bottom of each day's log.</li>
            </ul>
          </div>
        </section>

        {/* ── Drinks ───────────────────────────────────────────────────────── */}
        <section id="drinks" className={styles.section}>
          <h2 className={styles.sectionTitle}>Tracking Drinks</h2>
          <div className={styles.featureCard}>
            <p>
              Drinks work just like any other food in the app. Store-bought drinks are ingredients.
              Homemade drinks like sweet tea are recipes.
            </p>
            <ul className={styles.featureList}>
              <li><strong>Store-bought drinks:</strong> Scan the barcode (for cans, bottles, juice boxes) or search by name on the Import Ingredients page. Save it as an ingredient under the Beverages category.</li>
              <li><strong>Homemade drinks (sweet tea, smoothies, etc.):</strong> Create a recipe in the Cookbook and add the Beverages and Homemade tags. Add your ingredients — water, tea bags, sugar, fruit, etc. — and the nutrition calculates automatically.</li>
              <li><strong>Scaling homemade drinks:</strong> Recipe scaling works perfectly. If your sweet tea recipe makes 1 quart, just change the servings to make a gallon and all ingredient amounts adjust automatically.</li>
              <li><strong>Logging a drink in the Macro Tracker:</strong> Go to Macros, find your name, and scroll down to the Drinks section (below Snacks). Tap + to add a drink ingredient or recipe and enter how many servings.</li>
              <li><strong>Drinks count toward daily totals:</strong> Any drinks you log in the Drinks section are included in your daily nutrition totals.</li>
            </ul>
          </div>
        </section>

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <section id="account" className={styles.section}>
          <h2 className={styles.sectionTitle}>Signing In &amp; Your Account</h2>
          <div className={styles.featureCard}>
            <p>
              Your household keeps its recipes, plans, and lists on its own private server at home. To use it, each person has their
              own account — a username and a password. Nobody signs themselves up: an <strong>owner</strong> adds each person.
            </p>

            <h3 className={styles.subFeatureTitle}>Signing in</h3>
            <ul className={styles.featureList}>
              <li><strong>Open the app</strong> from the address your household uses (ask an owner if you're not sure). On a phone or tablet, use your browser's "Add to Home Screen" so it opens like a regular app.</li>
              <li>Go to <strong>Settings → Data</strong> and find the <strong>Account</strong> box. Type your username and password and tap <strong>Sign In</strong>. (The app may also pop up and offer to take you there.)</li>
              <li>Once you're signed in, the box says "Signed in as" with your name and what you're allowed to do. You stay signed in on that device for about two months, so you won't be asked again each time.</li>
              <li><strong>To sign out</strong> (for example on a shared tablet), tap Sign Out in the same box. Your recipes stay on the device; they just stop syncing until someone signs in.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Changing your password</h3>
            <ul className={styles.featureList}>
              <li>In <strong>Settings → Data → Account</strong>, tap <strong>Change my password</strong>. Type your current password, then the new one twice. Use at least 10 characters — a few words strung together works well.</li>
              <li>For safety, changing your password signs you out on your <em>other</em> devices. Sign in there again with the new password. The device you're using stays signed in.</li>
              <li><strong>Forgot your password?</strong> Ask an owner to reset it (see below), then change it to one only you know.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Who can do what</h3>
            <ul className={styles.featureList}>
              <li><strong>Owner</strong> — can do everything, including adding people, changing what they can do, and resetting passwords. Owners also see an extra "Dev Tools" item in the menu (advanced utilities most people never need).</li>
              <li><strong>Contributor</strong> — the everyday role. Can add and change recipes, ingredients, meal plans, and grocery lists, and everything syncs. Can't manage other people's accounts.</li>
              <li><strong>Read only</strong> — can look at everything and receive everyone's updates, but can't change anything. A banner at the top of each page says so. If a read-only person does type something in, it stays on their own device and isn't shared.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>For owners: adding and managing people</h3>
            <ul className={styles.featureList}>
              <li>Go to <strong>Settings → Data → Account</strong>. Owners see a <strong>People in this household</strong> list.</li>
              <li><strong>Add someone:</strong> tap <strong>+ Add a person</strong>, enter their name, a username, a starting password, and choose what they can do. Then tell them their username and password and suggest they change the password after they sign in.</li>
              <li><strong>Change what someone can do:</strong> use the drop-down next to their name. It takes effect right away, even if they're signed in.</li>
              <li><strong>Reset a forgotten password:</strong> tap <strong>Reset password</strong> under their name, type a new one, and tell them. They're signed out everywhere until they use it.</li>
              <li><strong>Turn someone's access off:</strong> tap <strong>Turn access off</strong>. They're signed out immediately and can't sign back in; tap <strong>Turn access back on</strong> any time. Nothing they added is lost.</li>
              <li><strong>Remove someone for good:</strong> tap <strong>Remove</strong> and confirm. Everything they added to the household stays.</li>
              <li>You can't turn off, remove, or demote the <em>last</em> owner — the app won't let the household lock itself out. To hand things over, make someone else an owner first.</li>
            </ul>
          </div>
        </section>

        {/* ── Syncing ──────────────────────────────────────────────────────── */}
        <section id="cloud-sync" className={styles.section}>
          <h2 className={styles.sectionTitle}>Syncing Between Devices</h2>
          <div className={styles.featureCard}>
            <p>
              Once you're signed in, the household's data is kept the same on every device, <strong>automatically</strong>. There are
              no buttons to remember: add a recipe on your phone and it shows up on the tablet a moment later.
            </p>
            <ul className={styles.featureList}>
              <li><strong>What's shared:</strong> ingredients (with prices), recipes, collections, kitchen reference pages, meal plans, grocery lists, household items, and the household's shared settings (name, people, categories, and so on).</li>
              <li><strong>What stays on each device:</strong> your API keys, theme, text size, and your Macro Tracker logs and weight.</li>
              <li><strong>When it syncs by itself:</strong> when you sign in; a few seconds after you change something; about once a minute while the app is open; when you come back to the app after using something else; and when your internet connection returns after being off.</li>
              <li><strong>Sync right now:</strong> go to <strong>Settings → Data</strong> and tap <strong>↕ Sync now</strong>. It's handy before you head out the door, but never required.</li>
              <li><strong>Working offline is fine.</strong> Everything on the device keeps working with no connection. Whatever you change is kept and goes up on its own when you're back online.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>The status pill</h3>
            <p className={styles.sectionDesc}>
              At the bottom of the menu (just the icon on a phone), a small pill tells you where things stand. Tap it to open the sync settings.
            </p>
            <ul className={styles.featureList}>
              {SYNC_PILL_HELP.map(([label, meaning]) => (
                <li key={label}><strong>{label}</strong> — {meaning}</li>
              ))}
            </ul>
            <p className={styles.sectionDesc}>
              Notes and banners can also appear at the top of a page. <strong>"Updated with changes from another device"</strong> just
              means someone else's change arrived while you were looking at the page — tap <strong>Refresh this page</strong> to see it.
            </p>

            <h3 className={styles.subFeatureTitle}>Adding a new device</h3>
            <ul className={styles.featureList}>
              <li>Open the app at the household's address on the new device and sign in (Settings → Data → Account).</li>
              <li>If the household already has data, the pill says <strong>Action needed</strong> and Settings → Data shows <strong>Your household already has data</strong>. Tap <strong>Join — use the household's data here</strong>.</li>
              <li>The device is then filled with the household's ingredients, recipes, and plans. If the device already had things of its own, a copy is saved to a file first, just in case. The first time can take a few minutes for a big household — you can wait on that screen.</li>
              <li>Don't make your own recipes on the new device before joining — joining replaces what's on the device with the household's. If the app offers to set up a household name or load the starter ingredients on a new device, you can skip that: joining brings the household's own.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>If you see "Same name, different item"</h3>
            <p className={styles.sectionDesc}>
              This happens when two devices each create an ingredient or recipe with the same name before they've synced — for example, when the
              starter ingredient library gets loaded on two devices. The app won't guess; it keeps both and asks you. A note appears at the top
              of the page, and the list lives in <strong>Settings → Data → Same name, different item</strong>.
            </p>
            <ul className={styles.featureList}>
              <li>Tap <strong>Review</strong> next to an item. It shows the item you already have and explains the choices:</li>
              <li><strong>Keep mine</strong> — keep the one on your device; the other is removed for everyone.</li>
              <li><strong>Keep theirs</strong> — replace yours with the other one. Any recipes, grocery lists, or logs that used yours are switched over to theirs automatically, so nothing breaks.</li>
              <li><strong>Keep both</strong> — keep both side by side (you can merge them later with the Merge button on an ingredient).</li>
              <li><strong>Not now</strong> — leave it for later. Nothing is lost.</li>
              <li><strong>Lots of them?</strong> Tick the ones you want (or none, for all of them) and use <strong>Keep all mine</strong>, <strong>Keep all theirs</strong>, or <strong>Keep all newer</strong> — which keeps whichever was changed most recently. After a starter-library mix-up, "Keep all newer" is usually the quick answer.</li>
              <li>Some warnings go away by themselves: if the other item is deleted or renamed, the app notices and adds the item without asking.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>If you removed a lot of things</h3>
            <p className={styles.sectionDesc}>
              If this device suddenly has many items missing since it last synced — say a reset or a restore went wrong — the app does <strong>not</strong>
              tell everyone else to delete them. A message asks: <strong>"This device has removed N items… Was that on purpose?"</strong>
            </p>
            <ul className={styles.featureList}>
              <li><strong>No — put them back</strong> brings them back from the household, as if nothing happened.</li>
              <li><strong>Yes — remove them for everyone</strong> removes them on every device. Only choose this if you really meant to clear them out.</li>
              <li>Ordinary deleting — a recipe here, an ingredient there — never asks; it just syncs.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>When two people change the same thing</h3>
            <p className={styles.sectionDesc}>
              If two people edit the very same recipe before their devices have talked, the newer change is kept, and the other version is saved in
              <strong> Settings → Data → Changes that overlapped</strong>. Tap <strong>Show</strong> to see them; <strong>Bring back the other version</strong>
              puts it back if the wrong one won. Nothing is ever thrown away silently.
            </p>
          </div>
        </section>

        {/* ── AI features ──────────────────────────────────────────────────── */}
        <section id="ai-features" className={styles.section}>
          <h2 className={styles.sectionTitle}>Photos, Receipts, Barcodes &amp; AI Helpers</h2>
          <div className={styles.infoBox}>
            <p>
              These features save you typing. Most use a free Google Gemini key (see <a href="#api-keys">Getting Your Free Keys</a> — one-time,
              about two minutes) and every one of them can be skipped: you can always type things in by hand. You'll need to be online
              for any of them. Your key goes through your household's server only to make each request and is never saved there.
            </p>
          </div>
          <div className={styles.featureCard}>
            <h3 className={styles.subFeatureTitle}>Barcode lookup (no key needed)</h3>
            <ul className={styles.featureList}>
              <li>Open <strong>Import Ingredients → Barcode Lookup</strong>. Tap <strong>📷 Scan Barcode with Camera</strong> and point it at the barcode on the package, about 6 inches away in good light. Or type the number into the <strong>Barcode number</strong> box.</li>
              <li>The app finds the product (name, brand, serving size, nutrition, and often Nutriscore and allergens). Check it over and save it as an ingredient.</li>
              <li><strong>Not found?</strong> Try Gemini Lookup (type the product name), USDA Lookup (for plain foods like "canned tomatoes"), or Scan Label.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Look up by name — Gemini Lookup &amp; USDA Lookup</h3>
            <ul className={styles.featureList}>
              <li><strong>Gemini Lookup</strong> (needs a Gemini key): type a product like "McCormick Ground Cinnamon" and the AI fills in nutrition facts. Best for packaged and branded items.</li>
              <li><strong>USDA Lookup</strong> (a free key is optional): type "chicken breast" or "brown rice" and pick the closest match. Best for fresh and plain foods.</li>
              <li>AI can be wrong. Glance at the numbers — especially serving size — before you save.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Scan a nutrition label</h3>
            <ul className={styles.featureList}>
              <li>Open <strong>Import Ingredients → Scan Label</strong>. Tap <strong>Take Photo or Scan Label</strong> (or choose a photo you already have).</li>
              <li>Drag the box so it covers just the nutrition panel — important when a package shows more than one product — then confirm.</li>
              <li>The AI reads the values for you to review and save. A blurry photo gets a friendly "couldn't read that" instead of wrong numbers; retake it with better light.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Scan a grocery receipt</h3>
            <ul className={styles.featureList}>
              <li>Open <strong>Import Ingredients → Receipt Scanner</strong>. Tap <strong>Take Photo or Scan Receipt</strong>. Lay the receipt flat, in good light, with the whole thing in view.</li>
              <li>Each line is matched against your ingredients. Strong matches are pre-ticked; for the others, pick the right ingredient or create a new one.</li>
              <li>You'll be asked how many servings are in each package (receipts never print that). Nothing is saved until you review it and confirm — and the app remembers receipts you've already scanned, so you won't add the same prices twice.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Bring in a recipe</h3>
            <ul className={styles.featureList}>
              <li>Go to <strong>Cookbook</strong> and tap <strong>Import</strong>. There are three tabs:</li>
              <li><strong>Import from URL</strong> — paste the web address of a recipe page. If the site won't let the app read it, open the page yourself, copy the recipe text, and use the next tab instead.</li>
              <li><strong>Paste Recipe Text</strong> — paste the text of a recipe. With a key set up, it's turned into a structured recipe; without one, it opens next to a blank recipe so you can type from it.</li>
              <li><strong>Photo</strong> — photograph a cookbook page, a recipe card, or a handwritten note (or choose a photo, or drag one in). Crop to just the recipe, then confirm. If one photo shows several recipes, the app may suggest a starting box for the next one; after you save, it asks <strong>"Crop Another Recipe?"</strong> — choose <strong>Crop Another From This Photo</strong> or <strong>I'm Done With This Photo</strong>.</li>
              <li>Whichever way you bring it in, you always get a chance to check and fix every field before saving. Handwriting in particular needs a careful look.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Digitize a kitchen reference page</h3>
            <ul className={styles.featureList}>
              <li>In the Cookbook, tap the <strong>Reference</strong> filter and then <strong>+ Add Reference</strong>. Attach a photo of the page (<strong>Take Photo or Scan Page</strong>) and the AI reads the title, text, and any table for you to tidy up. You'll be asked whether to keep the original photo.</li>
            </ul>
          </div>
        </section>

        {/* ── Settings Reference ──────────────────────────────────────────── */}
        <section id="settings-reference" className={styles.section}>
          <h2 className={styles.sectionTitle}>Settings Reference</h2>
          <div className={styles.featureCard}>
            <p>
              Settings has 7 tabs. The Setup Checklist at the top of the Settings page tracks which of the
              required and optional steps you've completed. Here's what's in each tab that isn't already
              covered elsewhere in this guide:
            </p>

            <h3 className={styles.subFeatureTitle}>Household</h3>
            <ul className={styles.featureList}>
              <li><strong>Household name &amp; size:</strong> covered in Getting Started above.</li>
              <li><strong>Payday Schedule (per person):</strong> optional — when editing a person, turn on Payday Schedule to mark how often they get paid and pick a color. Paydays then show as small colored dots on the Meal Plan calendar, purely as a visual reminder — it doesn't change anything else in the app.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Preferences</h3>
            <ul className={styles.featureList}>
              <li><strong>Unit System:</strong> Imperial (oz, lb, cups) or Metric (g, kg, ml) for how quantities display.</li>
              <li><strong>Theme:</strong> Light, Dark, or System (matches your device's setting).</li>
              <li><strong>Text Size:</strong> a slider from 10–20pt (plus quick presets) that scales all text in the app — handy on a tablet mounted farther away, or for anyone who wants larger text.</li>
              <li><strong>Store Preference:</strong> turn this on to add a "Store" field to ingredients and household items, so you can note where you usually buy something.</li>
              <li><strong>Kitchen Reference Photos:</strong> when you scan a cookbook/reference page with AI (see Cookbook below), this controls what happens to the original photo afterward — always ask, always keep it attached, or always discard it once the text is extracted.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Integrations</h3>
            <ul className={styles.featureList}>
              <li>This is where every API key from <a href="#api-keys">Getting Your Free Keys</a> gets pasted in — AI Provider, USDA, and Google Gemini. (Your sign-in and syncing live under Data, not here.)</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Optional Nutrients</h3>
            <ul className={styles.featureList}>
              <li><strong>Extra nutrient toggles:</strong> turn on tracking for Saturated Fat, Trans Fat, Alcohol, Water Intake, or Body Weight — off by default to keep the Macro Tracker simple. Once on, they show up as loggable fields there.</li>
              <li><strong>Macro history retention:</strong> how many days of past macro-log entries to keep before older ones are automatically cleaned up (30–365 days).</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Ingredients</h3>
            <ul className={styles.featureList}>
              <li><strong>Badge display toggles:</strong> show/hide the Nutriscore, Nova group, and allergen badges throughout the app (the underlying data is still saved either way — this just controls what's visually shown).</li>
              <li><strong>Allergen Watch List:</strong> pick which of the 12 tracked allergens (see Understanding Your Ingredients above) actually trigger a warning for your household. Leave off anything nobody in your home is sensitive to, to avoid warning fatigue.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Lists Management</h3>
            <ul className={styles.featureList}>
              <li>Manage the underlying lists used throughout the app as free-form text: ingredient categories, recipe tags (grouped, e.g. Protein/Cuisine/Source), brands, and stores. Add, rename, or remove entries. A fuzzy-duplicate warning flags near-identical entries (like "Chicken" and "Chickens") so your lists don't fragment over time.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Data</h3>
            <ul className={styles.featureList}>
              <li><strong>Account &amp; Household Sync:</strong> signing in, people, and syncing are covered in <a href="#account">Signing In &amp; Your Account</a> and <a href="#cloud-sync">Syncing Between Devices</a> above.</li>
              <li><strong>Export:</strong> three options — Ingredients only, Cookbook only (recipes, collections, and kitchen reference pages), or a Full Backup of everything. Save the file somewhere safe (like OneDrive) as a backup, or to hand a copy of your recipes to someone outside the household.</li>
              <li><strong>Import:</strong> bring in a previously exported file. If an item's ID already exists, choose to Skip it or Overwrite it with the imported version. (Once you are signed in, what you import syncs to the rest of the household.)</li>
              <li><strong>Reset:</strong> clear specific categories of data (just recipes, just the macro log, everything, etc.) without necessarily wiping the whole app — useful for starting a category fresh without losing the rest. If you are signed in, clearing a lot at once makes the app ask whether to remove it for everyone or put it back, so one device can't wipe the household by accident.</li>
            </ul>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section id="faq" className={styles.section}>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <div className={styles.faqList}>
            {[
              {
                q: 'What does the yellow dot mean on the calendar?',
                a: 'It means you have not planned all your meals for that day yet. For example, if you only added dinner but left breakfast and lunch empty, the day shows a yellow dot. Once all slots are filled in, the dot turns green.',
              },
              {
                q: 'How do I add my family members?',
                a: 'Go to Settings (the gear icon in the menu) and tap Household. Look for the People section and tap + Add Person. You can add a name and optional nutrition goals for each person. (That is for planning meals and portions. Giving someone their own login to the app is a separate thing — an owner does that in Settings → Data → Account.)',
              },
              {
                q: 'How do I make the grocery list?',
                a: 'Go to Grocery in the menu. Pick the start and end dates for your shopping trip, then tap Generate List. The app looks at all your planned meals for those days and builds the list.',
              },
              {
                q: 'How do I scale a recipe for more people?',
                a: 'Open the recipe from the Cookbook and look for the serving size box at the top. Change the number to how many people you are cooking for. All ingredient amounts adjust automatically.',
              },
              {
                q: 'How do I mark salt and pepper as always on hand?',
                a: 'Go to Ingredients, find the ingredient (like Salt), and tap it to open. Look for the switch that says "Always On Hand" and turn it on. The grocery list will never add this item even if a recipe calls for it.',
              },
              {
                q: 'How do I save my grocery list as a PDF?',
                a: 'Go to the Grocery page and generate your list. Once the list is showing, look for the "Save as PDF" button at the top. Tap it and your device will save a copy.',
              },
              {
                q: 'How do I use the app on a new phone or tablet?',
                a: 'Open the household\'s address in the browser (ask an owner for it), then use "Add to Home Screen" so it opens like a regular app. Sign in under Settings → Data → Account with the username and password an owner gave you. If the household already has data, tap "Join — use the household\'s data here" and everything comes over. See Adding a new device under Syncing Between Devices.',
              },
              {
                q: 'Who can see and change what?',
                a: 'Everyone with an account sees the same household data. Owners can do everything, including adding people. Contributors can add and change recipes, ingredients, plans, and lists. Read-only people can look but not change. See Who can do what under Signing In & Your Account.',
              },
              {
                q: 'I forgot my password. What do I do?',
                a: 'Ask an owner of your household. They go to Settings → Data → Account → People in this household, tap Reset password under your name, and give you a new one. Sign in with it, then change it to one only you know.',
              },
              {
                q: 'Do I have to sign in to use the app?',
                a: 'You can use the app without signing in — everything works and is kept on that one device. But nothing is shared with the rest of the household until you sign in, and a device that is not signed in will not get anyone else\'s changes.',
              },
              {
                q: 'Do I have to press a button to sync?',
                a: 'No. Once you are signed in, it happens by itself: when you sign in, a few seconds after you change something, about once a minute while the app is open, when you come back to the app, and when your internet returns. There is a "Sync now" button in Settings → Data if you want to be sure right away.',
              },
              {
                q: 'Can I use this app without internet?',
                a: 'Yes. Everything works offline except the lookups and photo features (barcode lookup, USDA, Gemini, scanning and importing) and sharing with the household. What you change offline is kept on the device and syncs by itself when you are back online.',
              },
              {
                q: 'Why does the status pill say "Offline — will sync later"?',
                a: 'The device can\'t reach your household\'s server right now — usually because you are away from home Wi-Fi, or the server is restarting. Nothing is lost. Keep using the app; it catches up on its own.',
              },
              {
                q: 'How do I log a drink in my macros?',
                a: 'Go to Macros, find your name tab, and scroll down to the Drinks section (below Snacks). Tap + to add a drink ingredient or recipe.',
              },
              {
                q: 'How do I add sweet tea so I can track it?',
                a: 'Create a recipe in the Cookbook tagged Beverages and Homemade. Add your ingredients — water, tea bags, and sugar. The macros calculate automatically. Then log it in the Drinks section of the Macro Tracker.',
              },
              {
                q: 'How do I back up my data?',
                a: 'Your household\'s server saves its own backup every night. You can also save a file yourself any time: Settings → Data → Export → Full Backup, and keep it somewhere safe like OneDrive. The full backup includes recipes, collections, kitchen reference pages, meal plans, grocery lists, and settings.',
              },
              {
                q: 'Can I share recipes with someone outside my household?',
                a: 'The old "Family Share" feature (a separate code for relatives in another home) has been retired for now. Everyone with an account sees the household\'s whole collection, and there is no separate sharing code any more. To give someone a copy of your recipes, use Settings → Data → Export → Cookbook and send them the file; they can bring it in with Settings → Data → Import. (Prices are part of ingredients, so they would see yours — they can change them after importing.)',
              },
            ].map(({ q, a }, i) => (
              <div key={i} className={styles.faqItem}>
                <button
                  className={`${styles.faqQuestion} ${openFaq === i ? styles.faqOpen : ''}`}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  {q}
                  <span className={styles.faqChevron} aria-hidden="true">{openFaq === i ? '▲' : '▼'}</span>
                </button>
                {openFaq === i && <div className={styles.faqAnswer}>{a}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* ── Troubleshooting ───────────────────────────────────────────────── */}
        <section id="troubleshooting" className={styles.section}>
          <h2 className={styles.sectionTitle}>Troubleshooting</h2>
          <div className={styles.troubleList}>
            {[
              {
                title: 'Camera not working for barcode scan',
                steps: [
                  'Check that your browser has camera permission. Tap the lock icon in the address bar (or camera icon), tap Permissions, and make sure Camera is set to Allow.',
                  'After changing permissions, refresh the page by tapping the refresh button.',
                  'If the camera starts but does not scan, try holding the barcode about 6 inches from the camera in good lighting.',
                  'If scanning still does not work, type the barcode number manually in the text box on the Barcode Lookup screen.',
                ],
              },
              {
                title: 'Barcode not found',
                steps: [
                  'The product may not be in the Open Food Facts database yet.',
                  'Try the Gemini Lookup tab in Import Ingredients — type the product name instead.',
                  'Or search for it in the USDA Lookup tab if it is a generic food like canned tomatoes.',
                  'Or use the Scan Label tab to photograph the nutrition facts panel directly.',
                ],
              },
              {
                title: 'Recipe import did not work',
                steps: [
                  'Make sure your Gemini free code is entered in Settings → Integrations, and that you are signed in and online.',
                  'Some websites block outside access. Try opening the page in your browser, selecting all the text (Ctrl+A or long-press → Select All), copying it, then pasting it in the Paste Recipe Text tab.',
                  'If the AI parsed the recipe incorrectly, you can edit every field in the recipe editor before saving.',
                ],
              },
              {
                title: 'A photo or receipt scan says it could not read it',
                steps: [
                  'This is the app being careful rather than guessing — it would rather say so than save wrong numbers.',
                  'Retake the photo in better light, hold the camera steady, and make sure the whole label, page, or receipt is in the picture and not curled or shadowed.',
                  'When you crop, drag the box so it is snug around just what you want read.',
                  'If it keeps failing, type it in by hand — every scanning feature has a manual way to do the same thing.',
                ],
              },
              {
                title: 'The status pill says "Sync problem"',
                steps: [
                  'Open Settings → Data. The message under "Sync status" says what went wrong in plain words.',
                  'Tap ↕ Sync now to try again. Most problems are temporary (a brief outage, or the server restarting) and clear on the next try.',
                  'Your changes are safe on this device in the meantime — nothing is lost, and everything goes up once it works again.',
                  'If it keeps happening for more than a few minutes while other devices are fine, tell an owner — the household\'s server may need attention.',
                  'If the message mentions being signed out, just sign in again (see "I keep getting signed out" below).',
                ],
              },
              {
                title: 'The status pill says "Offline — will sync later"',
                steps: [
                  'The device cannot reach the household\'s server. Check that Wi-Fi or mobile data is on, and that you are using the household\'s address.',
                  'If the household\'s server is reached over a private connection (such as Tailscale), make sure that app is running on this device.',
                  'Keep working. What you change is kept on the device and goes up automatically the moment the connection is back.',
                ],
              },
              {
                title: 'I can\'t sign in',
                steps: [
                  'Check the username (not an email address) and the password. Usernames are not case-sensitive; passwords are.',
                  'After a few wrong tries in a row the app makes you wait a short while (a little longer each time) before the next attempt — wait, then try again carefully.',
                  'Forgot it? Ask an owner to reset your password: Settings → Data → Account → People in this household → Reset password.',
                  'If it says your access is off, an owner has turned your account off — ask them to turn it back on.',
                ],
              },
              {
                title: 'I keep getting signed out',
                steps: [
                  'You are signed out on your other devices whenever your password is changed or reset — sign in again with the new one.',
                  'A sign-in lasts about two months, then you sign in again — that is normal.',
                  'If it happens on a home-screen app right after opening it, close the app fully and reopen it, then sign in once more.',
                ],
              },
              {
                title: 'It says "Action needed" and my new device is empty',
                steps: [
                  'On a new device, go to Settings → Data and tap "Join — use the household\'s data here". The household\'s ingredients, recipes, and plans are copied onto the device.',
                  'If the device had things of its own, a copy is saved to a file first. Look in your Downloads folder.',
                  'If you are an owner and this device genuinely holds the real data (and the household has only starter data on it), there is also a "This device has the real data…" button. Read what it says carefully before using it.',
                ],
              },
              {
                title: 'A message says this device "removed N items"',
                steps: [
                  'The app noticed a lot of items are gone from this device since it last synced, and is asking before it tells everyone else to delete them.',
                  'If you did not mean to remove them — for example a reset or restore went wrong — tap "No — put them back". They come back from the household and nothing is lost.',
                  'If you really did mean to clear them out, tap "Yes — remove them for everyone".',
                ],
              },
              {
                title: 'Changes I made seem to have disappeared, or an item changed back',
                steps: [
                  'If two people changed the same thing at nearly the same time, the newer change is kept. The other version is saved in Settings → Data → Changes that overlapped — tap Show, then "Bring back the other version" if the wrong one won.',
                  'If you have the read-only role, changes you make stay on your device and are not shared — a banner at the top of the page says so. Ask an owner if you should be able to edit.',
                  'If your changes are not showing on another device, check that device\'s status pill, and tap Sync now there.',
                ],
              },
              {
                title: 'I see "Same name, different item" or a note about duplicates',
                steps: [
                  'Two devices each made an item with the same name, so the app kept both and is asking you which to keep.',
                  'Go to Settings → Data → Same name, different item and choose for each one — or use Keep all newer for a quick fix. Full steps are under Syncing Between Devices.',
                  'Nothing is lost while it waits.',
                ],
              },
              {
                title: 'A page looks out of date',
                steps: [
                  'If a note at the top says "Updated with changes from another device", tap Refresh this page.',
                  'Otherwise, tap Sync now in Settings → Data, then reopen the page.',
                ],
              },
              {
                title: 'App is not loading',
                steps: [
                  'Try refreshing the page. On a tablet, press and hold the refresh button.',
                  'Try closing the browser tab completely and reopening the app.',
                  'If it still does not load, try a hard refresh: press Ctrl+Shift+R on a computer, or clear the browser cache in your browser settings.',
                  'If it will not load on any device, the household\'s server may be down — tell an owner.',
                ],
              },
              {
                title: 'I think I lost my data',
                steps: [
                  'First check that you are signed in (Settings → Data → Account). If you are, and the pill is not "Offline", the household\'s copy is safe on the server — tap Sync now.',
                  'If this device looks empty, you may have been signed out or this may be a new copy of the app: sign in and tap "Join" if it offers.',
                  'Your household\'s server saves a backup every night, so an earlier copy can be restored if it is ever needed. You can also keep your own: Settings → Data → Export → Full Backup, saved somewhere safe like OneDrive.',
                  'If you have an export file, Settings → Data → Import brings it back.',
                ],
              },
              {
                title: 'I changed phones or reinstalled the app',
                steps: [
                  'Open the household\'s address, add it to your home screen again, and sign in. If the household has data, tap Join and everything comes back.',
                  'The old copy of the app on the old device can be deleted. Its data is in the household\'s copy.',
                ],
              },
              {
                title: 'Who do I ask for help with accounts?',
                steps: [
                  'An owner of your household. Owners can add people, reset forgotten passwords, change what each person can do, and turn accounts off or on — all from Settings → Data → Account.',
                ],
              },
              {
                title: 'Family Share sync isn\'t working',
                steps: [
                  'If a Family Share sync doesn\'t complete, you\'ll see a clear message explaining what happened — not raw technical text. Common reasons:',
                  '"You are a read-only member" — you were invited as a Read Only participant, so you can pull shared content but can\'t push changes back. This is expected, not an error with your account.',
                  'Any other error — the message will tell you what happened and let you know you can safely retry; nothing is lost if a sync doesn\'t finish.',
                  'If you\'re not sure what to do, check that you\'re signed in, and that the person who invited you hasn\'t changed your Family Share access.',
                ],
              },
            ].map(({ title, steps }, i) => (
              <div key={i} className={styles.troubleItem}>
                <div className={styles.troubleTitle}>{title}</div>
                <ul className={styles.troubleSteps}>
                  {steps.map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <p>Still need help? Ask an owner of your household — they can also reset a password or add you to the app.</p>
          <button className={styles.footerLink} onClick={() => navigate('/settings')}>
            ⚙️ Go to Settings
          </button>
        </div>

      </div>
    </div>
  )
}
