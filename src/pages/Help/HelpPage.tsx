import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './HelpPage.module.css'

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
    ['#getting-started',    'Getting Started'],
    ['#api-keys',           'Setting Up Free Services'],
    ['#ingredients',        'Ingredients'],
    ['#ingredient-info',    'Understanding Your Ingredients'],
    ['#json-import',        'JSON Import'],
    ['#cookbook',           'Cookbook'],
    ['#planner',            'Meal Plan'],
    ['#grocery',            'Grocery List'],
    ['#macros',             'Macro Tracker'],
    ['#drinks',             'Drinks'],
    ['#cloud-sync',         'Cloud Sync & Sign In'],
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
              This app helps your family plan meals for the week, track what you eat, build your grocery
              list automatically, and sync everything between your devices. You add your ingredients and
              recipes once — then every week you tap which meals you want each day and the app tells you
              exactly what to buy at the store. No more forgetting things or buying the same item twice.
            </p>
          </div>
        </section>

        {/* ── Getting Started ──────────────────────────────────────────────── */}
        <section id="getting-started" className={styles.section}>
          <h2 className={styles.sectionTitle}>Getting Started</h2>
          <p className={styles.sectionDesc}>Follow these steps in order and you will be up and running in no time.</p>
          <div className={styles.infoBox}>
            <p>
              Before step 3 below, it's worth two minutes to set up a couple of free services — they make
              adding ingredients and recipes much faster (auto-filling nutrition facts instead of typing
              them by hand). See <a href="#api-keys">Setting Up Free Services</a> for exact steps. Everything
              in this app also works completely fine without them — you can always add these later.
            </p>
          </div>
          <div className={styles.stepsCard}>
            {[
              ['⚙️ Set your household name', 'Go to Settings and type your family name, like "The Smith Family". This name appears at the top of the app.'],
              ['👥 Add your family members', 'In Settings → Household, add each person in your home. Each person gets their own nutrition tracking.'],
              ['🥕 Add ingredients', 'Go to Ingredients and tap + Add Ingredient. Add everything you cook with. You can also scan barcodes on the Import page.'],
              ['📖 Add recipes', 'Go to the Cookbook and tap + New Recipe. Type in a recipe you love, or paste it from a cooking website.'],
              ['📅 Plan your meals', 'Go to Meal Plan and tap each day to choose recipes for breakfast, lunch, and dinner.'],
              ['🛒 Generate your grocery list', 'Go to Grocery, pick your shopping dates, and tap Generate List. The app figures out everything you need.'],
              ['📊 Track your nutrition (optional)', 'Go to Macros to see your daily nutrition totals and log what you actually ate.'],
              ['☁️ Sync across your devices (optional)', 'Want the same data on your phone and tablet? See Cloud Sync & Sign In below — it takes about five extra minutes.'],
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

        {/* ── Setting Up Free Services ─────────────────────────────────────── */}
        <section id="api-keys" className={styles.section}>
          <h2 className={styles.sectionTitle}>Setting Up Free Services</h2>
          <div className={styles.infoBox}>
            <p>
              This app can use a few outside services to save you typing — looking up nutrition facts
              automatically, reading a recipe photo, or keeping your data in sync across devices. Each one
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
              Free — Google gives every account a daily allowance that resets every day (the app defaults
              to the model with the highest free allowance, currently 500 requests/day). <strong>If you skip
              this:</strong> Scan Label, Receipt Scanner, Kitchen Reference photo-scan, and recipe photo import
              won't work at all — those specifically require this key. Gemini Lookup (packaged products) and
              recipe import by URL/pasted text also work better with it, but have manual fallbacks without it.
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

          {/* Supabase */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>☁️</span>
              <div>
                <div className={styles.apiCardTitle}>Supabase — Free</div>
                <div className={styles.apiCardSub}>What it's for: syncing your data between your own devices, signing in, and sharing recipes with family</div>
              </div>
            </div>
            <p className={styles.apiCardBody}>
              A free cloud database — think of it as a private storage locker for your data that every one
              of your devices can check into. <strong>If you skip this:</strong> the app works completely
              normally on one device; you just won't be able to access the same data from a second device,
              or sign in, or share recipes with family elsewhere. See{' '}
              <a href="#cloud-sync">Cloud Sync &amp; Sign In</a> below for what these unlock in full.
            </p>
            <div className={styles.apiSteps}>
              {[
                'Open Supabase in a new tab using the button below.',
                'Click "Start for free" and create a free account.',
                'Click "New Project" and give it a name like "Family Meal Planner". Choose a region close to you, and set a database password (save it somewhere — Supabase may ask for it again, though this app never needs it directly).',
                'Once the project is ready (may take a minute or two), click "Project Settings" (gear icon) in the left menu, then click "API".',
                'Copy the "Project URL" (starts with https://). Paste it into Settings → Integrations → Supabase Project URL.',
                'Copy the "anon public" key (the long one under Project API keys). Paste it into Settings → Integrations → Supabase Anon Key.',
                'Go to Settings → Data → Cloud Sync. Tap "Show database setup SQL", copy the whole thing, and run it in Supabase under Database → SQL Editor → New Query → Run. This creates the tables your data lives in.',
                'Still in Settings → Data → Cloud Sync, tap "Show account/sign-in setup SQL" and run that too, the same way — this is what lets you actually sign in and create/join a household in the next step. It\'s four scripts run back-to-back; paste and run each one in order, waiting for each to finish before running the next.',
                'Now go to Settings → Data → Cloud Sync → Account and create your account (email + password) — see Cloud Sync & Sign In below for what to do next.',
              ].map((step, i) => (
                <div key={i} className={styles.apiStep}>
                  <div className={styles.apiStepNum}>{i + 1}</div>
                  <div className={styles.apiStepText}>{step}</div>
                </div>
              ))}
            </div>
            <a href="https://supabase.com" target="_blank" rel="noreferrer" className={styles.openLinkBtn}>
              Open Supabase in a New Tab →
            </a>
          </div>

          <div className={styles.privacyNote}>
            <strong>Keep your codes private.</strong> Treat them like passwords. They are stored only on your
            device and are never sent to anyone except the service you are using them for.
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
              <li><strong>Starter ingredient packs:</strong> The first time you have some ingredients but haven't finished setup, the app offers two optional bundles you can load instantly instead of typing everything by hand: 101 generic USDA basics (raw meats, produce, dairy, grains, seasonings — no brand or price data) and 867 Great Value branded grocery products (real barcodes, package sizes, Nutriscore/Nova ratings, and allergen info where available, sourced from Open Food Facts). They're fully independent — load either, both, or neither, and only items not already in your database get added either way.</li>
              <li><strong>Scan a barcode:</strong> Tap Import Ingredients in the menu, then tap the Barcode Lookup tab. Tap Scan Barcode with Camera, point your camera at the barcode, and hold steady. The app will find the product automatically.</li>
              <li><strong>Search USDA:</strong> In Import Ingredients, tap the USDA Lookup tab. Type an ingredient name like "chicken breast" to find its nutrition data. Works great for fresh meats, produce, and grains.</li>
              <li><strong>Gemini Lookup:</strong> In Import Ingredients, tap the Gemini Lookup tab. Type a product name like "McCormick Ground Cinnamon" and the AI will fill in the nutrition facts. Great for packaged and branded products.</li>
              <li><strong>Scan Label:</strong> In Import Ingredients, tap the Scan Label tab to photograph a nutrition facts label — take a photo or upload one, then crop tightly to just the nutrition panel (handy when a package shows more than one product) and the AI reads off the values for you. Works on desktop with a webcam and on mobile with the camera.</li>
              <li><strong>Receipt Scanner:</strong> In Import Ingredients, tap the Receipt Scanner tab to photograph a grocery receipt and update ingredient pricing in bulk. Each line is matched against your existing ingredients with a confidence level — high-confidence matches are pre-selected, others ask you to pick the right one or create a new ingredient — and nothing is saved until you review and confirm. You'll be asked for servings-per-package on each item since receipts never print that.</li>
              <li><strong>Bulk Entry:</strong> In Import Ingredients, use the Bulk Entry tab to add many simple ingredients at once by typing them in a list.</li>
              <li><strong>Bulk JSON Import:</strong> Already have a JSON file of ingredients — from a Settings → Data export or an Open Food Facts bulk-converter tool? Go to Import Ingredients → JSON Import, drop the file in, optionally filter to specific brands, and import them all at once. Duplicates are detected automatically using the same smart matching used everywhere else in the app.</li>
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
              <li><strong>Duplicate detection:</strong> Uses the same smart matching as the rest of the app — barcode match first, then exact name and brand, then fuzzy name matching — so re-imports and near-duplicate names merge in instead of creating copies.</li>
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
              <li><strong>Import from a website:</strong> Tap Import in the Cookbook. Paste the recipe URL and the AI will extract everything automatically. If the site blocks copying, open it in your browser, copy the text, and use the Paste Text tab instead.</li>
              <li><strong>Import by pasting text:</strong> In the Import screen, switch to the Paste Recipe Text tab. Paste any recipe text and the AI will parse it into structured fields.</li>
              <li><strong>Import from a photo:</strong> In the Import screen, switch to the Photo tab to photograph a printed or handwritten recipe (a cookbook page, a recipe card, etc.). Requires a Google Gemini key — see <a href="#api-keys">Setting Up Free Services</a>. Review every field afterward, since handwriting and page photos are harder to read perfectly than clean text.</li>
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
              <li><strong>Leftovers:</strong> Tap any recipe in a day and choose "Mark as Leftovers from…" to link it back to an earlier meal so the grocery list does not add duplicate ingredients.</li>
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

        {/* ── Cloud Sync ───────────────────────────────────────────────────── */}
        <section id="cloud-sync" className={styles.section}>
          <h2 className={styles.sectionTitle}>Cloud Sync &amp; Sign In</h2>
          <div className={styles.featureCard}>
            <p>
              Cloud sync lets you access your meal plan from any device and share recipes with family
              members in another home. It uses Supabase — a free cloud database (see{' '}
              <a href="#api-keys">Setting Up Free Services</a> to create one). Getting this fully working
              has two parts: signing in (who you are), and a household (which family's data you're syncing).
            </p>

            <h3 className={styles.subFeatureTitle}>1. Sign In (Settings → Data → Cloud Sync → Account)</h3>
            <ul className={styles.featureList}>
              <li><strong>What it is:</strong> A real personal account (email + password) for this app, separate from your Google/Gmail account or anything else. This is new — earlier versions of this app only had the shared code below.</li>
              <li><strong>Why bother:</strong> It's what lets you (and only you, or people you've specifically added) manage who has access, instead of "anyone who has the code can get in."</li>
              <li><strong>Create an account:</strong> Once your Supabase Project URL and Anon Key are entered in Settings → Integrations, an Account box appears here. Tap Sign Up, enter an email and a password (6+ characters), and tap Create Account. Check your email for a confirmation link if asked for one.</li>
              <li><strong>Create your household:</strong> After signing in, tap "+ Create a Household," give it a name (like "Smith Family"), and leave the code blank to have one generated for you automatically — or type your own. This is the same kind of code as the Household Sync Code below; creating a household here sets it for you automatically.</li>
              <li><strong>Join an existing household:</strong> If someone in your home already created one, tap "Join by Code" instead and enter the code they gave you.</li>
              <li><strong>Trouble signing up or creating a household?</strong> This usually means the Supabase project is missing a one-time setup step — see the "Show account/sign-in setup SQL" button right below the Account box in Settings, and the Supabase steps in <a href="#api-keys">Setting Up Free Services</a>.</li>
              <li><strong>The sign-in reminder popup:</strong> If you're not signed in, the app shows a one-time reminder about this when you open it. Check "Don't show this again" to dismiss it for good, or turn it back on any time via the toggle right below the Account box in Settings.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>2. Household Sync (sync between your own devices)</h3>
            <ul className={styles.featureList}>
              <li><strong>What syncs:</strong> Everything — ingredients (with prices), recipes, recipe collections, kitchen reference pages, meal plans, grocery lists, household items.</li>
              <li><strong>What never syncs:</strong> Personal macro logs, weight history, and device-specific preferences like theme, text size, and API keys. These stay on each device.</li>
              <li><strong>If you signed in above and created/joined a household:</strong> Your Household Sync Code is already filled in — you're done, just tap "Sync with Cloud."</li>
              <li><strong>Without signing in:</strong> You can still type or generate a Household Sync Code directly and sync with it — this still works, it just doesn't have the per-person access control signing in gives you.</li>
              <li><strong>How to sync:</strong> Go to Settings → Data → Cloud Sync. Tap "Sync with Cloud" to sync in both directions, "Push to Cloud" to send your changes up, or "Pull from Cloud" to get changes from the cloud.</li>
              <li><strong>Syncing with a spouse or partner:</strong> Have them sign in (or enter the same Household Sync Code) on their device, using the same Supabase Project URL and Anon Key as you. Then either of you can tap "Sync with Cloud" to stay in sync.</li>
              <li><strong>Merge logic:</strong> The app is smart about merging. If the same item exists on both devices, the newer version wins. New items from the cloud are added; new items from your device are uploaded. Nothing is ever silently deleted.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>3. Family Share (share recipes with out-of-state family)</h3>
            <ul className={styles.featureList}>
              <li><strong>What it shares:</strong> Recipes and ingredient nutrition info — but no prices, package costs, or store names. Family members fill in their own prices locally.</li>
              <li><strong>Why prices are not included:</strong> Prices vary by location and store. Your grocery store prices are private to your household. Family in another state uses their own local prices.</li>
              <li><strong>How to share:</strong> In Settings → Data → Cloud Sync, create a Family Share Code. Give this code to your family member. They enter it on their device and tap "Pull from Family" to get your recipes.</li>
              <li><strong>Read Only vs. Contributor:</strong> Read Only family members can only pull (receive) your recipes. Contributors can both pull and push, so they can also share their own recipes back to you.</li>
              <li><strong>Disconnect a family member:</strong> Tap "Regenerate" next to the Family Share Code to create a new code. Anyone using the old code will no longer receive future syncs.</li>
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
              <li>This is where every API key from <a href="#api-keys">Setting Up Free Services</a> gets pasted in — AI Provider, USDA, Google Gemini, and Supabase.</li>
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
              <li><strong>Cloud Sync:</strong> covered in full in <a href="#cloud-sync">Cloud Sync &amp; Sign In</a> above.</li>
              <li><strong>Export:</strong> three options — Ingredients only, Cookbook only (recipes/collections/references), or a Full Backup of everything. Save the file somewhere safe (like OneDrive) as a backup, or to move data to another device manually.</li>
              <li><strong>Import:</strong> bring in a previously exported file. If an item's ID already exists, choose to Skip it or Overwrite it with the imported version.</li>
              <li><strong>Reset:</strong> clear specific categories of data (just recipes, just the macro log, everything, etc.) without necessarily wiping the whole app — useful for starting a category fresh without losing the rest.</li>
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
                a: 'Go to Settings (the gear icon in the menu) and tap Household. Look for the People section and tap + Add Person. You can add a name and optional nutrition goals for each person.',
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
                q: 'How do I share the app with a family member?',
                a: 'Send them this link: angelo-meal-planner.netlify.app — they can open it in Chrome on any phone, tablet, or computer. In Chrome, they can tap the share button and choose "Add to Home Screen" to make it work like a regular app.',
              },
              {
                q: 'How do I get my data onto my tablet?',
                a: 'Option 1: Go to Settings → Data → Export, save the file to OneDrive, then on the tablet open the app and go to Settings → Data → Import. Option 2: Set up Cloud Sync and tap "Pull from Cloud" on the tablet.',
              },
              {
                q: 'Can I use this app without internet?',
                a: 'Yes — everything works offline except barcode lookup, USDA search, Gemini lookup, and cloud sync. Your data is saved on your device.',
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
                q: 'Why does my family member not see my prices?',
                a: 'Prices are only shared through Household Sync (for people in your home). The Family Share feature intentionally leaves out prices because grocery prices vary by location — family in another state shops at different stores with different prices. They fill in their own local prices.',
              },
              {
                q: 'How do I sync between my phone and tablet?',
                a: 'Set up a free Supabase project (see Setting Up Free Services), enter its URL and key in Settings → Integrations on both devices, then go to Settings → Data → Cloud Sync → Account and sign in with the same account on both (or just set the same Household Sync Code on both, without signing in). Tap "Sync with Cloud" on either device.',
              },
              {
                q: 'Do I have to sign in to use Cloud Sync?',
                a: 'No. Signing in (Settings → Data → Cloud Sync → Account) adds real per-person access control, but the older method — setting the same Household Sync Code on every device — still works on its own without ever signing in.',
              },
              {
                q: 'How do I disconnect a family member from Family Share?',
                a: 'Go to Settings → Data → Cloud Sync and tap "Regenerate" next to the Family Share Code. Anyone using the old code will no longer receive your future syncs.',
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
                  'Check that Chrome has camera permission. Tap the lock icon in the address bar (or camera icon), tap Permissions, and make sure Camera is set to Allow.',
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
                  'Make sure your Gemini free code is entered in Settings → Integrations.',
                  'Some websites block outside access. Try opening the page in your browser, selecting all the text (Ctrl+A or long-press → Select All), copying it, then pasting it in the Paste Recipe Text tab.',
                  'If the AI parsed the recipe incorrectly, you can edit every field in the recipe editor before saving.',
                ],
              },
              {
                title: 'Cloud sync is not working',
                steps: [
                  'Make sure both devices have the same Supabase URL and Anon Key in Settings → Integrations.',
                  'Make sure both devices have the same Household Sync Code in Settings → Data → Cloud Sync (or, if using sign-in, that both are signed into the same household).',
                  'Check that you ran the database setup SQL in your Supabase project (Database → SQL Editor). If you use the Account sign-in feature, the separate "account/sign-in setup SQL" needs to be run too — both buttons are in Settings → Data → Cloud Sync.',
                  'Try tapping "Pull from Cloud" on one device first to see if connection works before doing a full sync.',
                ],
              },
              {
                title: 'Signing up or creating a household gives a database error',
                steps: [
                  'This means the Supabase project is missing the one-time setup for accounts/households — go to Settings → Data → Cloud Sync and tap "Show account/sign-in setup SQL".',
                  'Copy the whole thing and run it in Supabase under Database → SQL Editor → New Query → Run. It\'s actually four scripts back-to-back — run each one, wait for it to finish, then run the next.',
                  'Come back and try signing up / creating a household again.',
                  'You do not need to do any of this to use Household Sync with just a code — signing in is an optional extra layer on top of it.',
                ],
              },
              {
                title: 'App is not loading',
                steps: [
                  'Try refreshing the page. On a tablet, press and hold the refresh button.',
                  'Try closing the browser tab completely and reopening the app.',
                  'If it still does not load, try a hard refresh: press Ctrl+Shift+R on a computer, or clear the browser cache in your browser settings.',
                ],
              },
              {
                title: 'I think I lost my data',
                steps: [
                  'Your data is stored on your device in the browser. Clearing browser data or switching browsers can erase it.',
                  'If you have a recent export file, go to Settings → Data → Import to restore it.',
                  'If you set up Cloud Sync, tap Pull from Cloud — your data may be safe in the cloud.',
                  'Going forward, export a backup at least once a week from Settings → Data → Export Full Backup. Save it to OneDrive.',
                ],
              },
              {
                title: 'I see a Sign In / Sign Up box — is that required?',
                steps: [
                  'No — the whole app works fully offline with no account at all. The Account box in Settings → Data → Cloud Sync, and the occasional popup reminding you about it, are both entirely optional.',
                  'It only exists to support Cloud Sync — accessing your data from more than one device — see Cloud Sync & Sign In above.',
                  'To stop the reminder popup, check "Don\'t show this again" on it once, or turn off "Show the sign-in reminder on launch" in Settings → Data → Cloud Sync.',
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
          <p>Still need help? The app link is <strong>angelo-meal-planner.netlify.app</strong></p>
          <button className={styles.footerLink} onClick={() => navigate('/settings')}>
            ⚙️ Go to Settings
          </button>
        </div>

      </div>
    </div>
  )
}
