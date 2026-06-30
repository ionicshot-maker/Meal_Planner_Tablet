# Getting Your Free API Keys

This guide walks you through getting the two optional free codes that make the Meal Planner app even better at looking up nutrition information. You do not need these to use the app, but once you have them, adding ingredients becomes much faster.

---

## What Are These Codes?

Think of an API key like a library card. The library (USDA or Google) lets you look things up for free, but you need a card first so they know who is using their system. It takes about two minutes to get each one, and they are completely free.

---

## USDA FoodData Central Key

**What it does:** Lets the app search the USDA's database of over 600,000 foods. Great for chicken, vegetables, pasta, rice, and other basic ingredients.

### Steps

**Step 1.** Open a new browser tab and go to:
```
https://fdc.nal.usda.gov/api-guide
```

**Step 2.** Look for the section that says **"API Key"** and click the button that says **"Request an API Key"** (or follow the link on the page to register).

**Step 3.** Fill out the short form:
- First Name
- Last Name  
- Email Address
- Check the box that says you agree to the terms

**Step 4.** Click **Submit**. Within a few minutes, you will get an email from the USDA with your key. It will look something like this:
```
Your API key is: aBcD1234EfGh5678IjKl9012
```

**Step 5.** Come back to the Meal Planner app:
1. Tap **Settings** (the ⚙️ gear icon in the menu)
2. Tap **Integrations**
3. Find the box labelled **"USDA API Key (optional)"**
4. Paste your key into the box — it saves automatically

That's it! From now on, when you go to Import Ingredients → USDA Lookup, you will have a higher rate limit and faster searches.

> **Keep your key private.** Treat it like a password. Do not share it in emails or messages.

---

## Google Gemini API Key

**What it does:** Lets the app use Google's AI to look up nutrition facts for packaged and branded products — like "McCormick Garlic Powder" or "Quaker Old Fashioned Oats." It also automatically fills in nutrition when a barcode scan comes back with no data.

### Steps

**Step 1.** Open a new browser tab and go to:
```
https://aistudio.google.com/apikey
```

**Step 2.** You will be asked to sign in. Use your **Google account** — the same email you use for Gmail or YouTube.

**Step 3.** Once you are signed in, you will see a page called **"API Keys"**. Click the button that says **"Create API Key"**.

**Step 4.** A box will pop up asking you to choose a project. Click **"Create project in a new project"** and give it any name — something like "Meal Planner" works fine. Then click **Create**.

**Step 5.** Your key will appear on the screen. It will be a long string of letters and numbers, like:
```
AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123456
```
Click the **Copy** button next to it to copy it.

**Step 6.** Come back to the Meal Planner app:
1. Tap **Settings** (the ⚙️ gear icon in the menu)
2. Tap **Integrations**
3. Scroll down to find the box labelled **"Google Gemini API Key (optional)"**
4. Paste your key into the box — it saves automatically

That's it! Now when you scan a barcode and the app finds no nutrition info, it will automatically ask Gemini to look it up. You can also use the new **Gemini Lookup** tab on the Import page to look up any packaged product by name.

> **Keep your key private.** Your Gemini key gives access to Google AI on your behalf. Do not share it with anyone or post it online.

---

## Checking That Your Keys Work

After adding your keys, test them:

1. Go to **Import Ingredients** in the menu
2. Tap the **USDA Lookup** tab
3. Type "chicken breast" and tap **Search USDA**
4. You should see a list of results appear — that means your USDA key is working!

For Gemini:
1. Tap the **Gemini Lookup** tab
2. Type "McCormick garlic powder" and tap **Look Up with Gemini**
3. You should see the nutrition review screen appear — that means your Gemini key is working!

---

## Troubleshooting

**I did not get the USDA email.**
Check your spam/junk folder. USDA emails sometimes land there. If it is not there after 10 minutes, try submitting the form again.

**My Gemini key is not working.**
Make sure you copied the full key without any extra spaces before or after it. Try tapping the "Show" button next to the key field in Settings to see what was pasted.

**I accidentally shared my key.**
Go back to the website and delete the key. Then create a new one and update it in Settings. Both websites let you manage and revoke keys at any time.

---

## Free Usage Limits

Both keys are completely free for personal use at this scale:

| Service | Free Limit |
|---------|-----------|
| USDA FoodData Central | 1,000 requests per hour |
| Google Gemini AI | 15 requests per minute, 1 million tokens per day |

For a family meal planner, you will never come close to hitting these limits.
