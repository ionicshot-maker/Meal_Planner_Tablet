import styles from './HelpPage.module.css'

export default function HelpPage() {
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
          {[
            ['#welcome',         'Welcome'],
            ['#getting-started', 'Getting Started'],
            ['#api-keys',        'Free Codes Setup'],
            ['#ingredients',     'Ingredients'],
            ['#import',          'Importing'],
            ['#cookbook',        'Cookbook'],
            ['#planner',         'Meal Plan'],
            ['#grocery',         'Grocery List'],
            ['#macros',          'Macros'],
            ['#faq',             'FAQ'],
            ['#troubleshooting', 'Troubleshooting'],
          ].map(([href, label]) => (
            <a key={href} href={href} className={styles.tocLink}>{label}</a>
          ))}
        </nav>

        {/* ── Welcome ─────────────────────────────────────────────────────── */}
        <section id="welcome" className={styles.section}>
          <h2 className={styles.sectionTitle}>Welcome to Your Meal Planner</h2>
          <div className={styles.welcomeCard}>
            <p>
              This app helps your family plan your meals for the week, keep track of what you eat,
              and build your grocery list automatically. You add your ingredients and recipes once,
              and then every week you simply tap which meals you want each day — and the app tells
              you exactly what to buy at the store. No more forgetting things or buying the same
              thing twice.
            </p>
          </div>
        </section>

        {/* ── Getting Started ──────────────────────────────────────────────── */}
        <section id="getting-started" className={styles.section}>
          <h2 className={styles.sectionTitle}>Getting Started</h2>
          <p className={styles.sectionDesc}>Follow these five steps and you will be up and running in no time.</p>
          <div className={styles.stepsCard}>
            {[
              ['Set up your household', 'Go to Settings (the gear icon ⚙️ in the menu) and type your family name, like "The Angelo Family". This name appears at the top of the app.'],
              ['Add your ingredients', 'Go to Ingredients and tap + Add Ingredient. Add the things you cook with — chicken, pasta, olive oil, and so on. You can also scan barcodes using the Import page.'],
              ['Add your recipes', 'Go to the Cookbook and tap + New Recipe. Type in a recipe you love, or paste it in from a cooking website.'],
              ['Plan your meals', 'Go to Meal Plan and tap each day of the week to choose which recipe you want for breakfast, lunch, and dinner.'],
              ['Get your grocery list', 'Go to Grocery, pick your shopping dates, and tap Generate List. The app will tell you exactly what to buy.'],
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

        {/* ── API Keys Setup ───────────────────────────────────────────────── */}
        <section id="api-keys" className={styles.section}>
          <h2 className={styles.sectionTitle}>Optional Features That Need a Free Code</h2>
          <div className={styles.infoBox}>
            <p>
              Some extra features need a free code from a website — think of it like getting a
              library card that lets you borrow books. The code is completely free, takes about
              two minutes to get, and unlocks the ability to automatically look up nutrition
              information just by scanning a barcode or typing a product name.
            </p>
            <p style={{ marginTop: 'var(--space-2)' }}>
              <strong>You do not need these codes to use the app.</strong> They are optional extras.
              But once you have them, adding ingredients becomes much faster.
            </p>
          </div>

          {/* USDA */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>🌾</span>
              <div>
                <div className={styles.apiCardTitle}>USDA Ingredient Lookup</div>
                <div className={styles.apiCardSub}>Great for fresh foods like chicken, vegetables, and grains</div>
              </div>
            </div>
            <div className={styles.apiSteps}>
              {[
                'Open a new tab and go to the USDA website.',
                'Click the button that says "Request an API Key".',
                'Type your name and email address in the form.',
                'Check your email for a message from USDA — your code will be inside.',
                'Come back to this app, go to Settings, tap Integrations, and paste your code in the box labelled "USDA API Key".',
              ].map((step, i) => (
                <div key={i} className={styles.apiStep}>
                  <div className={styles.apiStepNum}>{i + 1}</div>
                  <div className={styles.apiStepText}>{step}</div>
                </div>
              ))}
            </div>
            <a
              href="https://fdc.nal.usda.gov/api-guide"
              target="_blank"
              rel="noreferrer"
              className={styles.openLinkBtn}
            >
              Open USDA Website in a New Tab →
            </a>
          </div>

          {/* Gemini */}
          <div className={styles.apiCard}>
            <div className={styles.apiCardHeader}>
              <span className={styles.apiCardIcon}>✨</span>
              <div>
                <div className={styles.apiCardTitle}>Google Gemini Ingredient Lookup</div>
                <div className={styles.apiCardSub}>Smarter — great for packaged products with barcodes</div>
              </div>
            </div>
            <div className={styles.apiSteps}>
              {[
                'Open a new tab and go to the Google AI Studio website.',
                'Sign in with your Google account — the same email you use for Gmail.',
                'Click the button that says "Create API Key".',
                'Click "Create Project" and give it any name you like — it does not matter what you call it.',
                'Copy the long code that appears on the screen.',
                'Come back to this app, go to Settings, tap Integrations, and paste your code in the box labelled "Google Gemini API Key".',
              ].map((step, i) => (
                <div key={i} className={styles.apiStep}>
                  <div className={styles.apiStepNum}>{i + 1}</div>
                  <div className={styles.apiStepText}>{step}</div>
                </div>
              ))}
            </div>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className={styles.openLinkBtn}
            >
              Open Google AI Studio in a New Tab →
            </a>
          </div>

          <div className={styles.privacyNote}>
            <strong>Keep your codes private.</strong> Treat them like a password. Do not share them
            in a text message, email, or with anyone else. They are stored only on your device and
            are never sent to anyone but the service you are using them for.
          </div>
        </section>

        {/* ── Feature: Ingredients ─────────────────────────────────────────── */}
        <section id="ingredients" className={styles.section}>
          <h2 className={styles.sectionTitle}>Adding Ingredients</h2>
          <div className={styles.featureCard}>
            <p>
              An ingredient is anything you buy at the store or keep in your kitchen — chicken
              breast, olive oil, black pepper, pasta, and so on. Before you can use an ingredient
              in a recipe, you need to add it to your list first.
            </p>
            <p>
              To add an ingredient, go to <strong>Ingredients</strong> in the menu and tap
              <strong> + Add Ingredient</strong>. You will see a form where you can type the name,
              pick a category (like "Meat" or "Pantry"), and optionally fill in the nutrition
              information.
            </p>
            <p>
              You can also mark ingredients as <strong>Always On Hand</strong> — for things
              like salt, pepper, and olive oil that you always have in your kitchen. When you mark
              something as Always On Hand, the grocery list knows not to add it, even if a recipe
              uses it.
            </p>
            <p>
              If you have multiple brands of the same ingredient (like store-brand and name-brand
              canned tomatoes), you can add them as <strong>variants</strong> of the same
              ingredient — just tap the ingredient and look for "Add Variant".
            </p>
          </div>
        </section>

        {/* ── Feature: Import ──────────────────────────────────────────────── */}
        <section id="import" className={styles.section}>
          <h2 className={styles.sectionTitle}>Importing Ingredients (The Fast Way)</h2>
          <div className={styles.featureCard}>
            <p>
              The fastest way to add ingredients is using the <strong>Import Ingredients</strong>
              page. You have several options depending on what you have:
            </p>
            <ul className={styles.featureList}>
              <li>
                <strong>Barcode Scan:</strong> Tap the camera button and hold the product's
                barcode up to your screen. The app will look up the product automatically and
                fill in the name and nutrition facts for you.
              </li>
              <li>
                <strong>Type a Barcode:</strong> If the camera does not work, you can type the
                barcode number from the back of the package into the box.
              </li>
              <li>
                <strong>USDA Lookup:</strong> Type an ingredient name like "chicken breast" and
                the app will find it in the USDA food database. This works great for fresh meats,
                produce, and whole grains.
              </li>
              <li>
                <strong>Gemini Lookup:</strong> Type a product name like "McCormick Ground Cinnamon"
                and the AI will find the nutrition facts. This works great for packaged and
                branded products.
              </li>
            </ul>
            <p>
              After looking up an ingredient, you will see a screen where you can check the details
              and make any corrections before saving. Always take a quick look at the nutrition
              numbers and make sure they match what is on the label.
            </p>
          </div>
        </section>

        {/* ── Feature: Cookbook ────────────────────────────────────────────── */}
        <section id="cookbook" className={styles.section}>
          <h2 className={styles.sectionTitle}>Your Cookbook</h2>
          <div className={styles.featureCard}>
            <p>
              The <strong>Cookbook</strong> is where all your recipes live. Think of it as a
              digital recipe box that also calculates nutrition and cost for you automatically.
            </p>
            <p>
              To add a recipe, tap <strong>+ New Recipe</strong> and fill in the name, ingredients,
              and cooking steps. As you add ingredients, the app calculates the nutrition
              information and estimated cost per serving.
            </p>
            <p>
              You can also tap <strong>Import</strong> to paste in a recipe from a cooking
              website or magazine. The app will try to fill in all the details for you. It works
              best when you copy the full recipe text from the website.
            </p>
            <p>
              To make a recipe bigger or smaller, open it and look for the serving size box. Change
              the number of servings and all the ingredient amounts will adjust automatically.
            </p>
            <p>
              You can mark recipes as <strong>Favorites</strong> by tapping the star icon, and
              then filter by Favorites to find them quickly.
            </p>
          </div>
        </section>

        {/* ── Feature: Meal Plan ───────────────────────────────────────────── */}
        <section id="planner" className={styles.section}>
          <h2 className={styles.sectionTitle}>Planning Your Meals</h2>
          <div className={styles.featureCard}>
            <p>
              The <strong>Meal Plan</strong> page shows a full week at a glance with slots for
              Breakfast, Lunch, Dinner, and Snacks for each day.
            </p>
            <p>
              To add a meal, tap the <strong>+ button</strong> in any time slot and pick a recipe
              from your Cookbook. You can add more than one recipe to the same slot — for example,
              a main dish and a side.
            </p>
            <p>
              You will notice some days have a <strong>yellow dot</strong> on the calendar. That
              means you have not planned all the meals for that day yet. Once a day is fully
              planned, the dot turns green.
            </p>
            <p>
              Use the <strong>arrow buttons</strong> at the top to move forward and backward
              through the weeks. You can plan as far ahead as you like.
            </p>
            <p>
              You can also mark a meal as <strong>leftovers</strong> from a previous day — that
              way the grocery list knows you are reusing food already in your meal plan.
            </p>
          </div>
        </section>

        {/* ── Feature: Grocery ─────────────────────────────────────────────── */}
        <section id="grocery" className={styles.section}>
          <h2 className={styles.sectionTitle}>Your Grocery List</h2>
          <div className={styles.featureCard}>
            <p>
              The <strong>Grocery</strong> page builds your shopping list automatically based on
              your meal plan. You never have to write a list by hand again.
            </p>
            <p>
              To generate your list, pick the <strong>start and end dates</strong> for your
              shopping trip, then tap <strong>Generate List</strong>. The app will look at every
              recipe in your meal plan for those days and add up exactly what you need.
            </p>
            <p>
              Ingredients marked as <strong>Always On Hand</strong> will not appear on the list —
              the app knows you already have them.
            </p>
            <p>
              While you are shopping, tap any item to <strong>check it off</strong>. You can also
              mark items as Partially Bought if you only got some of what you needed.
            </p>
            <p>
              When you are done shopping, tap <strong>Save as PDF</strong> to save the list to
              your device, or just come back to the app at the store and use it directly on
              your phone or tablet.
            </p>
          </div>
        </section>

        {/* ── Feature: Macros ──────────────────────────────────────────────── */}
        <section id="macros" className={styles.section}>
          <h2 className={styles.sectionTitle}>Tracking Your Macros</h2>
          <div className={styles.featureCard}>
            <p>
              The <strong>Macros</strong> page shows you the nutrition totals for your day.
              You can see how many calories, grams of protein, carbs, and fat are in all your
              planned meals combined.
            </p>
            <p>
              If you have set up <strong>personal nutrition goals</strong> in your profile
              (Settings → Household → People), the Macros page will show a progress bar for
              each nutrient so you can see how close you are to your target.
            </p>
            <p>
              You can also <strong>log what you actually ate</strong> — for those days when
              lunch was a sandwich instead of what you had planned. Tap + Log Meal to record it.
            </p>
            <p>
              Your macro history is saved for up to 365 days so you can look back at trends
              over time.
            </p>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section id="faq" className={styles.section}>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <div className={styles.faqList}>
            {[
              {
                q: 'What does the yellow dot mean on the calendar?',
                a: 'It means you have not planned all your meals for that day yet. For example, if you only added a dinner recipe but left breakfast and lunch empty, the day will show a yellow dot. Once all your meals are filled in, the dot turns green.',
              },
              {
                q: 'How do I add my family members?',
                a: 'Go to Settings (the gear icon ⚙️ in the menu) and tap Household. Look for the People section and tap + Add Person. You can add a name and optional nutrition goals for each person in your household.',
              },
              {
                q: 'How do I make the grocery list?',
                a: 'Go to Grocery in the menu. You will see a date picker — choose the start and end of the week you are shopping for. Then tap Generate List. The app looks at all your planned meals for those days and builds the list for you.',
              },
              {
                q: 'How do I scale a recipe for more people?',
                a: 'Open the recipe from your Cookbook and look for the serving size box near the top. Tap the number and change it to how many people you are cooking for. All the ingredient amounts will automatically adjust to match.',
              },
              {
                q: 'How do I mark something as always on hand, like salt?',
                a: 'Go to Ingredients, find the ingredient you want (like Salt), and tap it to open it. Look for the switch that says "Always On Hand" and turn it on. Once this is on, the grocery list will never add this item even if a recipe needs it.',
              },
              {
                q: 'How do I save my grocery list as a PDF?',
                a: 'Go to the Grocery page and generate your list. Once the list is showing, look for the button that says "Save as PDF" at the top. Tap it and your device will save a copy of the list that you can print or keep for later.',
              },
              {
                q: 'How do I share the app with a family member?',
                a: 'Send them this link: angelo-meal-planner.netlify.app — they can open it in Chrome on any phone, tablet, or computer. They can also tap the share button in Chrome and choose "Add to Home Screen" to make it work like a regular app icon.',
              },
              {
                q: 'How do I get my data from one device to another, like from my phone to my tablet?',
                a: 'Go to Settings, tap Data, and then tap Export. This saves a file with all your data. Save that file to OneDrive or Google Drive. Then on your tablet, open the app, go to Settings → Data, tap Import, and choose the file you saved. All your ingredients, recipes, and meal plans will appear.',
              },
            ].map(({ q, a }, i) => (
              <div key={i} className={styles.faqItem}>
                <div className={styles.faqQuestion}>{q}</div>
                <div className={styles.faqAnswer}>{a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Troubleshooting ───────────────────────────────────────────────── */}
        <section id="troubleshooting" className={styles.section}>
          <h2 className={styles.sectionTitle}>Troubleshooting</h2>
          <p className={styles.sectionDesc}>
            Something not working quite right? Here are the most common issues and how to fix them.
          </p>
          <div className={styles.troubleList}>
            {[
              {
                title: 'The barcode scanner is not working',
                steps: [
                  'Make sure your device is connected to the internet — the app needs to look up the product online.',
                  'Try holding the barcode about 6 inches from the camera and make sure it is well-lit.',
                  'If the camera still does not work, type the barcode number manually in the text box — it is the long number printed below the barcode.',
                  'Some products are not in the Open Food Facts database. If the barcode is not found, try searching by name in the USDA or Gemini tab instead.',
                ],
              },
              {
                title: 'My recipe import did not work',
                steps: [
                  'Some websites block copying. Try selecting all the recipe text on the page and copying it.',
                  'Paste it into the text box on the Import Recipe screen and tap Parse Recipe.',
                  'If the automatic fill-in does not work well, you can always type the recipe in manually — it only takes a few minutes.',
                ],
              },
              {
                title: 'The app is not loading',
                steps: [
                  'Try refreshing the page by pressing the refresh button in your browser.',
                  'If it still does not load, close the browser tab completely and open the app again.',
                  'If you are on a tablet or phone, try closing the app from your recent apps and reopening it.',
                  'As a last resort, go to your browser settings and clear the cache, then reload.',
                ],
              },
              {
                title: 'I think I lost my data',
                steps: [
                  'Your data is stored on your device, not in the cloud. If you cleared your browser data or switched browsers, the data may be gone.',
                  'This is why we strongly recommend doing a regular Export from Settings → Data and saving the file to OneDrive.',
                  'If you have a recent export file, go to Settings → Data → Import to restore it.',
                  'Going forward, try to export at least once a week as a backup.',
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
          <p>Built with love for the Angelo family. 🍽️</p>
        </div>

      </div>
    </div>
  )
}
