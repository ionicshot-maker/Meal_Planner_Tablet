/*
 * Meal Planner: save ALL of this device's data to a file (read-only).
 *
 * WHY: before moving to the new household server, every piece of the household's real data has to be captured once, from the
 * device that holds it. The app's own Settings > Data > Export leaves out recipe collections and kitchen reference pages (older
 * versions); this reads every store directly, so nothing is left behind.
 *
 * HOW TO USE (on the device/browser that has the real data, at the OLD app's address):
 *   1. Open the old Meal Planner in the browser and let it finish loading.
 *   2. Press F12 (or right-click > Inspect), open the "Console" tab.
 *   3. Copy this ENTIRE file, paste it into the console, press Enter.
 *      (Chrome may ask you to type "allow pasting" first. That is normal; do it, then paste again.)
 *   4. A file named meal-planner-live-export-<date>.json downloads. The console prints how many records of each kind it found.
 *
 * WHAT IT DOES NOT DO: it never writes to the database (read-only transactions), never sends anything anywhere, and removes your API
 * keys (Gemini, USDA, the AI provider key) and any leftover Supabase credentials from the file it writes, so the file can be handled
 * without carrying secrets. Your keys stay in the app on this device.
 */
async function mealPlannerExport(dbName) {
  const STORES = ['ingredients', 'recipes', 'mealPlanDays', 'mealPlanTemplates', 'macroLogs', 'groceryLists', 'householdItems', 'collections', 'references', 'processedReceipts'];
  const SECRET_SETTINGS = ['geminiApiKey', 'usdaApiKey', 'openaiApiKey', 'groqApiKey', 'supabaseUrl', 'supabaseAnonKey', 'householdSyncCode', 'familyShareCode'];

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName || 'MealPlannerDB'); // no version given: opens as-is and never triggers an upgrade
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The database is blocked by another tab. Close other Meal Planner tabs and try again.'));
  });

  const present = Array.from(db.objectStoreNames);
  const read = (store, key) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const backup = { version: 1, scope: 'full', exportedAt: new Date().toISOString(), source: 'browser', dbVersion: db.version };
  const counts = {};
  const missing = [];
  for (const store of STORES) {
    if (!present.includes(store)) { missing.push(store); continue; }
    backup[store] = await read(store);
    counts[store] = backup[store].length;
  }
  if (present.includes('settings')) {
    const settings = await read('settings', 'app');
    if (settings) {
      const clean = { ...settings };
      for (const k of SECRET_SETTINGS) delete clean[k];
      if (clean.ai && typeof clean.ai === 'object') clean.ai = { ...clean.ai, apiKey: '' };
      backup.settings = clean;
      counts.settings = 1;
    }
  }
  db.close();
  return { backup, counts, missing };
}

(async () => {
  const { backup, counts, missing } = await mealPlannerExport();
  console.log('Meal Planner export: found');
  console.table(counts);
  if (missing.length) console.warn('Not present in this browser (older version of the app?):', missing.join(', '));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!backup.ingredients || (!backup.ingredients.length && !(backup.recipes || []).length)) {
    console.warn('No ingredients or recipes found. Is this the browser/address where the household actually uses the app?');
  }
  const name = 'meal-planner-live-export-' + new Date().toISOString().slice(0, 10) + '.json';
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log('Saved ' + name + ' (' + total + ' records, ' + Math.round(blob.size / 1024) + ' KB). Keep it safe; it is the household\'s data.');
})().catch((e) => console.error('Export failed:', e));
