/**
 * A file copy of this device's data, taken before anything replaces it (joining a household that already has data).
 * Same shape as Settings > Data > Export > Full backup (version 1) -- plus the two stores that export has always left out
 * (collections and kitchen references) -- so the existing importer reads it back.
 */
import { getRawDB } from '../db/schema';

export interface SafetyBackup extends Record<string, unknown> {
  version: 1; scope: 'full'; exportedAt: string;
  ingredients: unknown[]; recipes: unknown[]; settings: unknown;
  mealPlanDays: unknown[]; mealPlanTemplates: unknown[]; macroLogs: unknown[];
  groceryLists: unknown[]; householdItems: unknown[]; collections: unknown[]; references: unknown[];
}

export async function buildSafetyBackup(): Promise<SafetyBackup> {
  const db = await getRawDB();
  return {
    version: 1, scope: 'full', exportedAt: new Date().toISOString(),
    ingredients: await db.getAll('ingredients'),
    recipes: await db.getAll('recipes'),
    settings: await db.get('settings', 'app'),
    mealPlanDays: await db.getAll('mealPlanDays'),
    mealPlanTemplates: await db.getAll('mealPlanTemplates'),
    macroLogs: await db.getAll('macroLogs'),
    groceryLists: await db.getAll('groceryLists'),
    householdItems: await db.getAll('householdItems'),
    collections: await db.getAll('collections'),
    references: await db.getAll('references'),
  };
}

/** True when there is nothing here worth saving: no user-made data at all (a freshly installed copy, possibly with the starter
 * ingredient library loaded, which can be re-created any time). */
export function isEffectivelyEmpty(b: SafetyBackup, starterLibrarySeeded: boolean): boolean {
  const others = b.recipes.length + b.mealPlanDays.length + b.groceryLists.length + b.householdItems.length + b.collections.length + b.references.length + b.macroLogs.length;
  if (others > 0) return false;
  return b.ingredients.length === 0 || starterLibrarySeeded;
}

/** Saves the backup as a download. Returns the file name, or null when there was nothing worth saving. */
export async function downloadSafetyBackup(label: string, starterLibrarySeeded: boolean): Promise<string | null> {
  const backup = await buildSafetyBackup();
  if (isEffectivelyEmpty(backup, starterLibrarySeeded)) return null;
  const name = `${label}-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
