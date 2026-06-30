import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './HelpPage.module.css'

export default function HelpPage() {
  const navigate = useNavigate()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const TOC_ITEMS = [
    ['#welcome',         'Welcome'],
    ['#getting-started', 'Getting Started'],
    ['#ingredients',     'Ingredients'],
    ['#cookbook',        'Cookbook'],
    ['#planner',         'Meal Plan'],
    ['#grocery',         'Grocery List'],
    ['#macros',          'Macro Tracker'],
    ['#drinks',          'Drinks'],
    ['#cloud-sync',      'Cloud Sync'],
    ['#api-keys',        'Free Codes Setup'],
    ['#faq',             'FAQ'],
    ['#troubleshooting', 'Troubleshooting'],
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Help & Guide</h1>
        <p className={styles.subheading}>Everything you need to know, written in plain English.</p>
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
          <div className={styles.stepsCard}>
            {[
              ['⚙️ Set your household name', 'Go to Settings and type your family name, like "The Smith Family". This name appears at the top of the app.'],
              ['👥 Add your family members', 'In Settings → Household, add each person in your home. Each person gets their own nutrition tracking.'],
              ['🥕 Add ingredients', 'Go to Ingredients and tap + Add Ingredient. Add everything you cook with. You can also scan barcodes on the Import page.'],
              ['📖 Add recipes', 'Go to the Cookbook and tap + New Recipe. Type in a recipe you love, or paste it from a cooking website.'],
              ['📅 Plan your meals', 'Go to Meal Plan and tap each day to choose recipes for breakfast, lunch, and dinner.'],
              ['🛒 Generate your grocery list', 'Go to Grocery, pick your shopping dates, and tap Generate List. The app figures out everything you need.'],
              ['📊 Track your nutrition (optional)', 'Go to Macros to see your daily nutrition totals and log what you actually ate.'],
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
              <li><strong>Scan a barcode:</strong> Tap Import Ingredients in the menu, then tap the Barcode Lookup tab. Tap Scan Barcode with Camera, point your camera at the barcode, and hold steady. The app will find the product automatically.</li>
              <li><strong>Search USDA:</strong> In Import Ingredients, tap the USDA Lookup tab. Type an ingredient name like "chicken breast" to find its nutrition data. Works great for fresh meats, produce, and grains.</li>
              <li><strong>Gemini Lookup:</strong> In Import Ingredients, tap the Gemini Lookup tab. Type a product name like "McCormick Ground Cinnamon" and the AI will fill in the nutrition facts. Great for packaged and branded products.</li>
              <li><strong>Bulk Entry:</strong> In Import Ingredients, use the Bulk Entry tab to add many simple ingredients at once by typing them in a list.</li>
              <li><strong>Always On Hand:</strong> Mark things like salt, pepper, and olive oil as "Always On Hand." The grocery list will never add these items even when recipes use them — because you always have them in the kitchen.</li>
              <li><strong>Beverages filter:</strong> On the Ingredients page, tap the Beverages quick-filter button to see only your drink ingredients.</li>
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
              <li><strong>Scale a recipe:</strong> Open any recipe and find the serving size at the top. Change the number and all ingredient amounts adjust automatically.</li>
              <li><strong>Mark as Favorite:</strong> Tap the star icon on any recipe to mark it as a favorite. Filter by favorites to find them quickly.</li>
              <li><strong>Save as Template:</strong> Toggle "Save as Template" when editing a recipe. Templates appear separately and can be copied to create new recipes with the same base.</li>
              <li><strong>Incomplete nutrition warning:</strong> A yellow warning on a recipe means some ingredients are missing from your list or have no nutrition data. Tap the recipe to see which ingredients need attention.</li>
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
          <h2 className={styles.sectionTitle}>Cloud Sync</h2>
          <div className={styles.featureCard}>
            <p>
              Cloud sync lets you access your meal plan from any device and share recipes with family
              members in another home. It uses Supabase — a free cloud database you set up once.
            </p>

            <h3 className={styles.subFeatureTitle}>Household Sync (sync between your own devices)</h3>
            <ul className={styles.featureList}>
              <li><strong>What syncs:</strong> Everything — ingredients (with prices), recipes, meal plans, grocery lists.</li>
              <li><strong>What never syncs:</strong> Personal macro logs, weight history, and app preferences like theme and API keys. These stay on each device.</li>
              <li><strong>How to set it up:</strong> See the "Free Codes Setup" section below for step-by-step Supabase instructions.</li>
              <li><strong>How to sync:</strong> Go to Settings → Data → Cloud Sync. Enter or generate a Household Sync Code. Tap "Sync with Cloud" to sync in both directions, "Push to Cloud" to send your changes up, or "Pull from Cloud" to get changes from the cloud.</li>
              <li><strong>Syncing with a spouse or partner:</strong> Enter the same Household Sync Code on their device. Then either of you can tap "Sync with Cloud" to stay in sync.</li>
              <li><strong>Merge logic:</strong> The app is smart about merging. If the same item exists on both devices, the newer version wins. New items from the cloud are added; new items from your device are uploaded. Nothing is ever silently deleted.</li>
            </ul>

            <h3 className={styles.subFeatureTitle}>Family Share (share recipes with out-of-state family)</h3>
            <ul className={styles.featureList}>
              <li><strong>What it shares:</strong> Recipes and ingredient nutrition info — but no prices, package costs, or store names. Family members fill in their own prices locally.</li>
              <li><strong>Why prices are not included:</strong> Prices vary by location and store. Your grocery store prices are private to your household. Family in another state uses their own local prices.</li>
              <li><strong>How to share:</strong> In Settings → Data → Cloud Sync, create a Family Share Code. Give this code to your family member. They enter it on their device and tap "Pull from Family" to get your recipes.</li>
              <li><strong>Read Only vs. Contributor:</strong> Read Only family members can only pull (receive) your recipes. Contributors can both pull and push, so they can also share their own recipes back to you.</li>
              <li><strong>Disconnect a family member:</strong> Tap "Regenerate" next to the Family Share Code to create a new code. Anyone using the old code will no longer receive future syncs.</li>
            </ul>
          </div>
        </section>

        {/* ── Free Codes Setup ─────────────────────────────────────────────── */}
        <section id="api-keys" className={styles.section}>
          <h2 className={styles.sectionTitle}>Getting Your Free Codes</h2>
          <div className={styles.infoBox}>
            <p>
              Some extra features need a free code from a website — think of it like getting a library card.
              The codes are completely free, take about two minutes to set up, and unlock faster ingredient
              lookup, smarter recipe import, and cloud sync across your devices.
            </p>
            <p style={{ marginTop: 'var(--space-2)' }}>
              <strong>You do not need any of these to use the app.</strong> They are optional extras.
            </p>
          </div>

          {/* USDA */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>🌾</span>
              <div>
                <div className={styles.apiCardTitle}>USDA Ingredient Lookup — Free</div>
                <div className={styles.apiCardSub}>Best for fresh foods like chicken, vegetables, and grains</div>
              </div>
            </div>
            <div className={styles.apiSteps}>
              {[
                'Open the USDA website in a new tab using the button below.',
                'Click the button that says "Request an API Key".',
                'Type your name and email address in the form.',
                'Check your email for a message from USDA — your code will be inside.',
                'Come back to this app, go to Settings → Integrations, and paste your code in the "USDA API Key" box.',
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
                <div className={styles.apiCardSub}>For packaged product lookup AND automatic recipe import from websites</div>
              </div>
            </div>
            <div className={styles.apiSteps}>
              {[
                'Open Google AI Studio in a new tab using the button below.',
                'Sign in with your Google account — the same email you use for Gmail.',
                'Click the button that says "Create API Key" or "Get API Key".',
                'Click "Create Project" and give it any name — it does not matter what you call it.',
                'Copy the long code that appears on the screen. It starts with AIzaSy.',
                'Come back to this app, go to Settings → Integrations, and paste your code in the "Google Gemini API Key" box.',
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

          {/* Supabase */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>☁️</span>
              <div>
                <div className={styles.apiCardTitle}>Supabase Cloud Sync — Free</div>
                <div className={styles.apiCardSub}>For syncing between devices and sharing recipes with family</div>
              </div>
            </div>
            <div className={styles.apiSteps}>
              {[
                'Open Supabase in a new tab using the button below.',
                'Click "Start for free" and create a free account.',
                'Click "New Project" and give it a name like "Family Meal Planner". Choose a region close to you.',
                'Once the project is ready, click "Project Settings" (gear icon) in the left menu, then click "API".',
                'Copy the "Project URL" (starts with https://). Paste it into Settings → Integrations → Supabase Project URL.',
                'Copy the "anon public" key (the long one under Project API keys). Paste it into Settings → Integrations → Supabase Anon Key.',
                'Go to Settings → Data → Cloud Sync. Tap "Show database setup SQL", copy the SQL, run it in Supabase under Database → SQL Editor → New Query.',
                'Back in Settings → Data → Cloud Sync, type or generate a Household Sync Code and tap "Sync with Cloud".',
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
                a: 'Set up Cloud Sync by going to Settings → Integrations and entering your Supabase URL and key. Then go to Settings → Data → Cloud Sync, set a Household Sync Code (the same on both devices), and tap "Sync with Cloud".',
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
                  'Make sure both devices have the same Household Sync Code in Settings → Data → Cloud Sync.',
                  'Check that you ran the database setup SQL in your Supabase project (Database → SQL Editor).',
                  'Try tapping "Pull from Cloud" on one device first to see if connection works before doing a full sync.',
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
                title: 'The app asked me to log in',
                steps: [
                  'The app does not require a login. If you see a login screen you may be on the wrong website.',
                  'The correct address is: angelo-meal-planner.netlify.app',
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
