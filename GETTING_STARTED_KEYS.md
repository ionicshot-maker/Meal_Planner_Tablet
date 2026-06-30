# Getting Your Free API Keys & Cloud Sync Setup

This guide walks you through the three optional free services that make the Meal Planner app more powerful. You do not need any of these to use the app, but once you have them set up, ingredient lookup is faster, recipe import works automatically, and your data syncs across all your devices.

---

## What Are These Codes?

Think of an API key like a library card. The service (USDA, Google, or Supabase) lets you use their system for free, but you need a card first. Each one takes about two minutes to set up.

---

## USDA FoodData Central Key

**What it does:** Lets the app search the USDA's database of over 600,000 foods. Best for chicken, vegetables, pasta, rice, and other basic fresh ingredients.

### Steps

**Step 1.** Open a new browser tab and go to:
```
https://fdc.nal.usda.gov/api-guide
```

**Step 2.** Look for the section that says **"API Key"** and click the button that says **"Request an API Key"**.

**Step 3.** Fill out the short form:
- First Name
- Last Name
- Email Address
- Check the box agreeing to the terms

**Step 4.** Click **Submit**. Within a few minutes you will get an email from USDA with your key:
```
Your API key is: aBcD1234EfGh5678IjKl9012
```

**Step 5.** Come back to the app:
1. Tap **Settings** (⚙️ in the menu)
2. Tap **Integrations**
3. Find the box labelled **"USDA API Key (optional)"**
4. Paste your key — it saves automatically

> **Keep your key private.** Treat it like a password.

---

## Google Gemini API Key

**What it does:** Unlocks two features:
1. **Ingredient lookup** — Look up nutrition for packaged and branded products by name (McCormick garlic powder, Quaker oats, etc.)
2. **Recipe import** — Paste a recipe URL or text and the AI extracts everything automatically (ingredients, amounts, steps, nutrition)

### Steps

**Step 1.** Open a new browser tab and go to:
```
https://aistudio.google.com/apikey
```

**Step 2.** Sign in with your **Google account** (same as Gmail).

**Step 3.** Click **"Create API Key"** → **"Create project in a new project"**. Give it any name like "Meal Planner". Click Create.

**Step 4.** Your key appears on screen. It starts with `AIzaSy`. Click the **Copy** button.

**Step 5.** Come back to the app:
1. Tap **Settings** (⚙️ in the menu)
2. Tap **Integrations**
3. Find **"Google Gemini API Key (optional)"**
4. Paste your key — it saves automatically

> **Important:** Do NOT turn on billing for this project. Keeping billing off keeps it completely free. Do not share your key with anyone.

### Testing It

1. Go to **Import Ingredients** → **Gemini Lookup** tab
2. Type "McCormick garlic powder" and tap Look Up
3. You should see the nutrition review screen — it's working!

Also try: **Cookbook → Import** and paste any recipe URL. With Gemini configured, the app will import the recipe automatically.

---

## Supabase Cloud Sync (for syncing between devices)

**What it does:** Stores a copy of your ingredients, recipes, meal plans, and grocery lists in the cloud. You can then:
- **Household Sync:** Keep your phone and tablet in sync automatically
- **Family Share:** Share your recipes (without prices) with family members in another home

Personal macro logs, weight history, and app preferences (like your API keys) stay on each device and never go to the cloud.

### Steps

**Step 1.** Open a new browser tab and go to:
```
https://supabase.com
```

**Step 2.** Click **"Start for free"** and create a free account (you can sign up with GitHub or email).

**Step 3.** Once logged in, click **"New Project"**. Fill in:
- **Name:** Family Meal Planner (or anything you like)
- **Database Password:** choose something strong and save it somewhere safe
- **Region:** pick the one closest to you (e.g., US East)

Click **Create new project**. Wait about 2 minutes while it sets up.

**Step 4.** Once the project is ready, click **"Project Settings"** (the gear icon ⚙️ in the left sidebar), then click **"API"**.

**Step 5.** You will see two things you need:
- **Project URL** — looks like `https://abcdefghijklm.supabase.co`
- **anon public** key — a very long string under "Project API keys"

**Step 6.** Come back to the app:
1. Tap **Settings** → **Integrations**
2. Find **"Supabase Project URL"** and paste the Project URL
3. Find **"Supabase Anon Key"** and paste the anon public key
4. Both save automatically

**Step 7.** Set up the database tables:
1. In the app, go to **Settings → Data → Cloud Sync**
2. Tap **"Show database setup SQL"**
3. Copy all the SQL text that appears
4. Go back to your Supabase browser tab
5. In the left menu, click **Database → SQL Editor → New query**
6. Paste the SQL and click **Run**
7. You should see "Success. No rows returned."

**Step 8.** Back in the app at **Settings → Data → Cloud Sync**:
1. Under **Household Sync**, type or tap **Generate** to create a Household Sync Code
2. Tap **"↕ Sync with Cloud"** to do your first sync

### Syncing a Second Device

On the second device (tablet, phone, etc.):
1. Set up the same Supabase URL and Anon Key in Settings → Integrations
2. Go to Settings → Data → Cloud Sync
3. Enter the **same Household Sync Code** as your first device
4. Tap **"↓ Pull from Cloud"** to get all your data

From then on, tap **"↕ Sync with Cloud"** on either device to stay in sync.

### Family Share (sharing recipes with out-of-state family)

Family Share lets relatives in another home see your recipes. It shares recipes and ingredient nutrition — but **not** your prices, package costs, or store names (those are local to your grocery store).

1. In **Settings → Data → Cloud Sync**, find the **Family Share** section
2. Tap **Generate** to create a Family Share Code
3. Give that code to your family member
4. On their device, they enter the code and tap **"↓ Pull from Family"**

To stop sharing with someone, tap **Regenerate** — the old code stops working immediately.

---

## Free Usage Limits

All three services are completely free for personal use at this scale:

| Service | Free Limit |
|---------|-----------|
| USDA FoodData Central | 1,000 requests per hour |
| Google Gemini AI | 15 requests per minute, 1 million tokens per day |
| Supabase | 500 MB database, 5 GB bandwidth per month |

A family meal planner will never come close to hitting any of these limits.

---

## Troubleshooting

**I did not get the USDA email.**
Check your spam/junk folder. If not there after 10 minutes, try submitting the form again.

**My Gemini key is not working.**
Make sure you copied the full key with no extra spaces. In Settings → Integrations, look for a "Show" button next to the key field to verify what was pasted.

**Recipe import fails even with a Gemini key.**
Some websites block outside access. Try: open the page in your browser, copy all the text (Ctrl+A then Ctrl+C), then in the app go to Cookbook → Import → Paste Recipe Text tab and paste it there.

**Cloud sync says "Supabase not configured".**
Make sure both the Project URL and the Anon Key are filled in under Settings → Integrations. The URL should start with `https://` and the key is the long `anon public` key, not the `service_role` key.

**Cloud sync fails with a table error.**
You may not have run the database setup SQL yet, or it ran with errors. Go to Settings → Data → Cloud Sync → "Show database setup SQL", copy it, and run it again in Supabase Database → SQL Editor.

**I accidentally shared my key.**
Go back to the website and delete the old key. Create a new one and update it in Settings. All three services let you revoke keys at any time.
