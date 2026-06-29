# Angelo Family Meal Planner — Deployment

## App Info

| Field | Value |
|---|---|
| **App name** | Angelo Family Meal Planner |
| **Live URL** | https://angelo-meal-planner.netlify.app |
| **Netlify site name** | angelo-meal-planner |
| **GitHub repo** | https://github.com/ionicshot-maker/Meal_Planner_Tablet |
| **Default branch** | master |

---

## Deploying Updates

After making any code changes, run this command in the Claude Code prompt box:

```
! NODE_TLS_REJECT_UNAUTHORIZED=0 netlify deploy --prod --dir "C:\Users\ionic\OneDrive\Desktop\Meal_Planner_Tablet\dist"
```

This rebuilds the app and deploys to Netlify in one step. The live URL updates within seconds.

---

## Installing on Your Android Tablet

1. Open **Chrome** on the tablet
2. Go to **https://angelo-meal-planner.netlify.app**
3. Tap the **three-dot menu** (⋮) in the top right
4. Tap **Add to Home Screen** or **Install App**
5. Tap **Install** on the confirmation prompt

The app will appear as an icon on your home screen and works **fully offline** after the first load — all data is stored locally on the device using IndexedDB.

---

## Sharing with Family

Send anyone this URL:

```
https://angelo-meal-planner.netlify.app
```

They open it in Chrome on any device and tap **Add to Home Screen** to install it as an app. Each person gets their own local copy of the data.

---

## Backing Up & Restoring Data

### Export a backup
1. Open the app → **Settings** → **Data** → **Export Full Backup**
2. Save the downloaded JSON file to OneDrive so it's accessible from all your devices

The filename includes your household name and date — e.g. `Angelo-Family-Full-Backup-2026-06-29.json`.

### Import on a new device
1. Open the app on the new device → **Settings** → **Data** → **Import**
2. Pick the JSON backup file from OneDrive
3. Choose whether to **Skip Duplicates** or **Overwrite Existing** for any conflicts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| Offline storage | IndexedDB via `idb` |
| PWA | vite-plugin-pwa + Workbox |
| Hosting | Netlify (free tier, HTTPS automatic) |
| Build time | ~1 second |
| Bundle size | ~180 KB JS gzipped |
