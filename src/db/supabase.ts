import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAllIngredients, saveIngredient } from './ingredients'
import { getAllRecipes, saveRecipe } from './recipes'
import { getDB } from './schema'
import type { Ingredient, Recipe, AppSettings, MealPlanDay, GroceryList } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SyncDuplicate {
  type: 'ingredient' | 'recipe'
  localItem: Ingredient | Recipe
  cloudItem: Ingredient | Recipe
}

export interface SyncSummary {
  addedLocally: number
  uploadedToCloud: number
  updatedToNewer: number
  duplicatesForReview: SyncDuplicate[]
  errors: string[]
}

type CloudRow = { id: string; household_code: string; data: unknown; updated_at: string }

// ─── Client Factory ─────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null
let _clientUrl = ''
let _clientKey = ''

export function getSupabaseClient(url: string, key: string): SupabaseClient | null {
  if (!url || !key) return null
  if (_client && _clientUrl === url && _clientKey === key) return _client
  _client = createClient(url, key)
  _clientUrl = url
  _clientKey = key
  return _client
}

export function isSupabaseConfigured(settings: AppSettings): boolean {
  return Boolean(settings.supabaseUrl?.trim() && settings.supabaseAnonKey?.trim())
}

// ─── SQL Setup Script (shown to user in the Cloud Sync UI) ──────────────────

export const SUPABASE_SETUP_SQL = `-- Run this in your Supabase SQL editor (Database → SQL Editor → New Query)

create table if not exists ingredients (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists ingredients_code_idx on ingredients (household_code);

create table if not exists recipes (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists recipes_code_idx on recipes (household_code);

create table if not exists meal_plans (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists meal_plans_code_idx on meal_plans (household_code);

create table if not exists grocery_lists (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists grocery_lists_code_idx on grocery_lists (household_code);

create table if not exists sync_settings (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists sync_settings_code_idx on sync_settings (household_code);

-- Enable Row Level Security and allow public access via anon key
alter table ingredients   enable row level security;
alter table recipes        enable row level security;
alter table meal_plans     enable row level security;
alter table grocery_lists  enable row level security;
alter table sync_settings  enable row level security;

create policy if not exists "Public access" on ingredients   for all using (true) with check (true);
create policy if not exists "Public access" on recipes        for all using (true) with check (true);
create policy if not exists "Public access" on meal_plans     for all using (true) with check (true);
create policy if not exists "Public access" on grocery_lists  for all using (true) with check (true);
create policy if not exists "Public access" on sync_settings  for all using (true) with check (true);`

// ─── Generate a memorable sync code ─────────────────────────────────────────

const ADJECTIVES = ['happy', 'sunny', 'quick', 'bright', 'calm', 'brave', 'cool', 'wise', 'nice', 'bold']
const NOUNS = ['apple', 'table', 'river', 'garden', 'family', 'kitchen', 'meadow', 'bridge', 'market', 'pantry']

export function generateSyncCode(householdName?: string): string {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num  = Math.floor(Math.random() * 9000) + 1000
  const base = householdName?.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ''
  return base ? `${base}-${adj}-${num}` : `${adj}-${noun}-${num}`
}

// ─── Sync helpers ────────────────────────────────────────────────────────────

async function fetchCloudRows(supabase: SupabaseClient, table: string, code: string): Promise<CloudRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('household_code', code)
  if (error) throw new Error(`Supabase fetch error (${table}): ${error.message}`)
  return (data ?? []) as CloudRow[]
}

async function upsertCloudRow(supabase: SupabaseClient, table: string, code: string, id: string, data: unknown, updatedAt: string) {
  const { error } = await supabase
    .from(table)
    .upsert({ id, household_code: code, data, updated_at: updatedAt }, { onConflict: 'id' })
  if (error) throw new Error(`Supabase upsert error (${table}): ${error.message}`)
}

// Strips cost/store fields for Family Share sync
function stripCostData(ingredient: Ingredient): Ingredient {
  return {
    ...ingredient,
    variants: ingredient.variants.map(v => ({
      ...v,
      packageCost: undefined,
      totalServingsInPackage: undefined,
      costPerServing: undefined,
      store: undefined,
    })),
  }
}

// ─── Main sync functions ─────────────────────────────────────────────────────

export async function syncIngredients(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
  familyShare = false,
): Promise<Pick<SyncSummary, 'addedLocally' | 'uploadedToCloud' | 'updatedToNewer' | 'duplicatesForReview'>> {
  const result = { addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [] as SyncDuplicate[] }

  const localItems = await getAllIngredients(true)
  const localMap = new Map(localItems.map(i => [i.id, i]))
  const localNameMap = new Map(localItems.map(i => [i.name.toLowerCase().trim(), i]))

  if (direction !== 'pull') {
    // Push local → cloud
    for (const item of localItems) {
      const toUpload = familyShare ? stripCostData(item) : item
      await upsertCloudRow(supabase, 'ingredients', code, item.id, toUpload, item.updatedAt)
      result.uploadedToCloud++
    }
  }

  if (direction !== 'push') {
    // Pull cloud → local
    const cloudRows = await fetchCloudRows(supabase, 'ingredients', code)
    for (const row of cloudRows) {
      const cloudItem = row.data as Ingredient
      if (!cloudItem?.id) continue

      const local = localMap.get(cloudItem.id)
      if (!local) {
        // Check for name duplicate (same name, different ID)
        const nameDup = localNameMap.get(cloudItem.name?.toLowerCase().trim() ?? '')
        if (nameDup && nameDup.id !== cloudItem.id) {
          result.duplicatesForReview.push({ type: 'ingredient', localItem: nameDup, cloudItem })
        } else {
          await saveIngredient(cloudItem)
          result.addedLocally++
        }
      } else if (direction === 'both') {
        const cloudTime = new Date(row.updated_at).getTime()
        const localTime = new Date(local.updatedAt).getTime()
        if (cloudTime > localTime) {
          await saveIngredient(cloudItem)
          result.updatedToNewer++
        }
      }
    }
  }

  return result
}

export async function syncRecipes(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
): Promise<Pick<SyncSummary, 'addedLocally' | 'uploadedToCloud' | 'updatedToNewer' | 'duplicatesForReview'>> {
  const result = { addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [] as SyncDuplicate[] }

  const localItems = await getAllRecipes(true)
  const localMap = new Map(localItems.map(r => [r.id, r]))
  const localNameMap = new Map(localItems.map(r => [r.name.toLowerCase().trim(), r]))

  if (direction !== 'pull') {
    for (const item of localItems) {
      await upsertCloudRow(supabase, 'recipes', code, item.id, item, item.updatedAt)
      result.uploadedToCloud++
    }
  }

  if (direction !== 'push') {
    const cloudRows = await fetchCloudRows(supabase, 'recipes', code)
    for (const row of cloudRows) {
      const cloudItem = row.data as Recipe
      if (!cloudItem?.id) continue

      const local = localMap.get(cloudItem.id)
      if (!local) {
        const nameDup = localNameMap.get(cloudItem.name?.toLowerCase().trim() ?? '')
        if (nameDup && nameDup.id !== cloudItem.id) {
          result.duplicatesForReview.push({ type: 'recipe', localItem: nameDup, cloudItem })
        } else {
          await saveRecipe(cloudItem)
          result.addedLocally++
        }
      } else if (direction === 'both') {
        const cloudTime = new Date(row.updated_at).getTime()
        const localTime = new Date(local.updatedAt).getTime()
        if (cloudTime > localTime) {
          await saveRecipe(cloudItem)
          result.updatedToNewer++
        }
      }
    }
  }

  return result
}

async function syncMealPlans(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
): Promise<{ uploaded: number; downloaded: number }> {
  const db = await getDB()
  const localDays = await db.getAll('mealPlanDays') as MealPlanDay[]

  let uploaded = 0
  let downloaded = 0

  if (direction !== 'pull') {
    for (const day of localDays) {
      await upsertCloudRow(supabase, 'meal_plans', code, day.date, day, new Date().toISOString())
      uploaded++
    }
  }

  if (direction !== 'push') {
    const cloudRows = await fetchCloudRows(supabase, 'meal_plans', code)
    const tx = db.transaction('mealPlanDays', 'readwrite')
    for (const row of cloudRows) {
      const day = row.data as MealPlanDay
      if (!day?.date) continue
      await tx.store.put(day)
      downloaded++
    }
    await tx.done
  }

  return { uploaded, downloaded }
}

async function syncGroceryLists(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
): Promise<{ uploaded: number; downloaded: number }> {
  const db = await getDB()
  const localLists = await db.getAll('groceryLists') as GroceryList[]

  let uploaded = 0
  let downloaded = 0

  if (direction !== 'pull') {
    for (const list of localLists) {
      await upsertCloudRow(supabase, 'grocery_lists', code, list.id, list, list.generatedAt)
      uploaded++
    }
  }

  if (direction !== 'push') {
    const cloudRows = await fetchCloudRows(supabase, 'grocery_lists', code)
    const tx = db.transaction('groceryLists', 'readwrite')
    for (const row of cloudRows) {
      const list = row.data as GroceryList
      if (!list?.id) continue
      await tx.store.put(list)
      downloaded++
    }
    await tx.done
  }

  return { uploaded, downloaded }
}

// ─── Full sync orchestration ─────────────────────────────────────────────────

export async function runSync(
  settings: AppSettings,
  direction: 'both' | 'push' | 'pull',
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    addedLocally: 0,
    uploadedToCloud: 0,
    updatedToNewer: 0,
    duplicatesForReview: [],
    errors: [],
  }

  const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
  if (!supabase) {
    summary.errors.push('Supabase is not configured. Add your URL and key in Settings → Integrations.')
    return summary
  }

  const code = settings.householdSyncCode?.trim()
  if (!code) {
    summary.errors.push('No Household Sync Code set. Create one in Settings → Data → Cloud Sync.')
    return summary
  }

  try {
    const ing = await syncIngredients(supabase, code, direction)
    summary.addedLocally    += ing.addedLocally
    summary.uploadedToCloud += ing.uploadedToCloud
    summary.updatedToNewer  += ing.updatedToNewer
    summary.duplicatesForReview.push(...ing.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Ingredients: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const rec = await syncRecipes(supabase, code, direction)
    summary.addedLocally    += rec.addedLocally
    summary.uploadedToCloud += rec.uploadedToCloud
    summary.updatedToNewer  += rec.updatedToNewer
    summary.duplicatesForReview.push(...rec.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Recipes: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const mp = await syncMealPlans(supabase, code, direction)
    summary.addedLocally    += mp.downloaded
    summary.uploadedToCloud += mp.uploaded
  } catch (e) {
    summary.errors.push(`Meal plans: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const gl = await syncGroceryLists(supabase, code, direction)
    summary.addedLocally    += gl.downloaded
    summary.uploadedToCloud += gl.uploaded
  } catch (e) {
    summary.errors.push(`Grocery lists: ${e instanceof Error ? e.message : String(e)}`)
  }

  return summary
}

// ─── Family Share sync (recipes only, no cost/store data) ────────────────────

export async function runFamilyShareSync(
  settings: AppSettings,
  direction: 'both' | 'push' | 'pull',
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    addedLocally: 0,
    uploadedToCloud: 0,
    updatedToNewer: 0,
    duplicatesForReview: [],
    errors: [],
  }

  const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
  if (!supabase) {
    summary.errors.push('Supabase is not configured.')
    return summary
  }

  const shareCode = settings.familyShareCode?.trim()
  if (!shareCode) {
    summary.errors.push('No Family Share Code set.')
    return summary
  }

  const familyCode = `${shareCode}:family`

  if (settings.familyShareRole === 'readonly' && direction === 'push') {
    summary.errors.push('You are a read-only member. You cannot push to this family share.')
    return summary
  }

  try {
    const rec = await syncRecipes(supabase, familyCode, direction)
    summary.addedLocally    += rec.addedLocally
    summary.uploadedToCloud += rec.uploadedToCloud
    summary.updatedToNewer  += rec.updatedToNewer
    summary.duplicatesForReview.push(...rec.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Recipes: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    // Ingredients synced without cost data
    const ing = await syncIngredients(supabase, familyCode, direction, true)
    summary.addedLocally    += ing.addedLocally
    summary.uploadedToCloud += ing.uploadedToCloud
    summary.updatedToNewer  += ing.updatedToNewer
    summary.duplicatesForReview.push(...ing.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Ingredients: ${e instanceof Error ? e.message : String(e)}`)
  }

  return summary
}

// Re-export helpers needed in CloudSyncSection
export async function resolveIngredientDuplicate(
  action: 'keep-local' | 'keep-cloud' | 'keep-both',
  dup: SyncDuplicate & { type: 'ingredient' },
): Promise<void> {
  if (action === 'keep-cloud' || action === 'keep-both') {
    await saveIngredient(dup.cloudItem as Ingredient)
  }
}

export async function resolveRecipeDuplicate(
  action: 'keep-local' | 'keep-cloud' | 'keep-both',
  dup: SyncDuplicate & { type: 'recipe' },
): Promise<void> {
  if (action === 'keep-cloud' || action === 'keep-both') {
    await saveRecipe(dup.cloudItem as Recipe)
  }
}
