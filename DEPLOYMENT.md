# Angelo Family Meal Planner — Deployment

## App Info

| Field | Value |
|---|---|
| **App name** | Angelo Family Meal Planner |
| **Live URL** | https://voluble-tarsier-6746db.netlify.app |
| **Netlify project** | voluble-tarsier-6746db |
| **GitHub repo** | https://github.com/ionicshot-maker/Meal_Planner_Tablet |

> **To rename the URL:** Log into [app.netlify.com](https://app.netlify.com), open the site, go to **Site configuration → General → Site details → Change site name**, type `angelo-meal-planner`. The URL will become `https://angelo-meal-planner.netlify.app`.

---

## Deploying Updates

After making changes to the code, run a build and redeploy with a single command:

```
! NODE_TLS_REJECT_UNAUTHORIZED=0 netlify deploy --prod
```

Or from the Windows command prompt / terminal:

```
cd "C:\Users\ionic\OneDrive\Desktop\Meal_Planner_Tablet"
set NODE_TLS_REJECT_UNAUTHORIZED=0
netlify deploy --prod
```

Netlify reads `netlify.toml` and knows to build with `npm run build` and publish the `dist/` folder.

---

## Installing on Your Android Tablet

1. Open **Chrome** on the tablet
2. Navigate to **https://voluble-tarsier-6746db.netlify.app**
3. Tap the **three-dot menu** (⋮) in the top right
4. Tap **Add to Home Screen** or **Install App**
5. Tap **Install** on the confirmation prompt

The app will appear on your home screen and works **fully offline** after the first load — all data is stored locally on the device using IndexedDB.

---

## Sharing with Family

Send anyone the URL:

```
https://voluble-tarsier-6746db.netlify.app
```

They open it in Chrome on any device and tap **Add to Home Screen** to install it. Each person gets their own local copy of the data — nothing is shared over the network (the app is purely client-side with no backend).

---

## Backing Up & Restoring Data

### Export a backup
1. Open the app → **Settings** → **Data** → **Export Full Backup**
2. Save the JSON file to OneDrive (or another cloud folder you have access to from all devices)

The filename will include your household name and date, e.g. `Angelo-Family-Full-Backup-2026-06-29.json`.

### Import on a new device
1. Open the app on the new device → **Settings** → **Data** → **Import**
2. Select the JSON backup file from OneDrive
3. Choose whether to skip or overwrite any duplicates

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| Offline storage | IndexedDB via `idb` |
| PWA | vite-plugin-pwa + Workbox |
| Hosting | Netlify (free tier) |
| Build time | ~1 second |
| Bundle size | ~180 KB JS gzipped |
