import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAllIngredients, saveIngredient } from './ingredients'
import { getAllRecipes, saveRecipe } from './recipes'
import { getAllHouseholdItems, saveHouseholdItem } from './householdItems'
import { getAllCollections, saveCollection } from './collections'
import { saveMealPlanDay } from './mealPlan'
import { saveGroceryList } from './groceryLists'
import { loadSettings, saveSettingsWithTimestamp } from './settings'
import { getDB } from './schema'
import type {
  Ingredient, Recipe, AppSettings, MealPlanDay, GroceryList,
  HouseholdItem, RecipeCollection, AIProvider,
} from '@/types'

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

create table if not exists household_items (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists household_items_code_idx on household_items (household_code);

create table if not exists collections (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists collections_code_idx on collections (household_code);

create table if not exists sync_settings (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists sync_settings_code_idx on sync_settings (household_code);

-- Enable Row Level Security and allow public access via anon key
alter table ingredients      enable row level security;
alter table recipes          enable row level security;
alter table meal_plans       enable row level security;
alter table grocery_lists    enable row level security;
alter table household_items  enable row level security;
alter table collections      enable row level security;
alter table sync_settings    enable row level security;

create policy if not exists "Public access" on ingredients      for all using (true) with check (true);
create policy if not exists "Public access" on recipes          for all using (true) with check (true);
create policy if not exists "Public access" on meal_plans       for all using (true) with check (true);
create policy if not exists "Public access" on grocery_lists    for all using (true) with check (true);
create policy if not exists "Public access" on household_items  for all using (true) with check (true);
create policy if not exists "Public access" on collections      for all using (true) with check (true);
create policy if not exists "Public access" on sync_settings    for all using (true) with check (true);`

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

// Generic push/pull/merge for stores keyed by id (or any unique string), using
// newest-timestamp-wins merge logic. Ingredients and recipes use their own
// variant of this (below) because they also need name-based duplicate detection.
async function syncStore<T>(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
  table: string,
  localItems: T[],
  getKey: (item: T) => string | undefined,
  getUpdatedAt: (item: T) => string | undefined,
  saveItem: (item: T) => Promise<void>,
): Promise<Pick<SyncSummary, 'addedLocally' | 'uploadedToCloud' | 'updatedToNewer'>> {
  const result = { addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0 }
  const localMap = new Map(localItems.map(i => [getKey(i), i]))

  if (direction !== 'pull') {
    for (const item of localItems) {
      const key = getKey(item)
      if (!key) continue
      await upsertCloudRow(supabase, table, code, key, item, getUpdatedAt(item) || new Date().toISOString())
      result.uploadedToCloud++
    }
  }

  if (direction !== 'push') {
    const cloudRows = await fetchCloudRows(supabase, table, code)
    for (const row of cloudRows) {
      const cloudItem = row.data as T
      const key = getKey(cloudItem)
      if (!key) continue

      const local = localMap.get(key)
      if (!local) {
        await saveItem(cloudItem)
        result.addedLocally++
      } else {
        const cloudTime = new Date(row.updated_at).getTime()
        const localTime = new Date(getUpdatedAt(local) || 0).getTime()
        if (cloudTime > localTime) {
          await saveItem(cloudItem)
          result.updatedToNewer++
        }
      }
    }
  }

  return result
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
      } else {
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
      } else {
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
) {
  const db = await getDB()
  const localDays = await db.getAll('mealPlanDays') as MealPlanDay[]
  return syncStore(
    supabase, code, direction, 'meal_plans', localDays,
    day => day.date,
    day => day.updatedAt,
    saveMealPlanDay,
  )
}

async function syncGroceryLists(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const db = await getDB()
  const localLists = await db.getAll('groceryLists') as GroceryList[]
  return syncStore(
    supabase, code, direction, 'grocery_lists', localLists,
    list => list.id,
    list => list.updatedAt || list.generatedAt,
    saveGroceryList,
  )
}

async function syncHouseholdItems(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const localItems = await getAllHouseholdItems()
  return syncStore<HouseholdItem>(
    supabase, code, direction, 'household_items', localItems,
    item => item.id,
    item => item.updatedAt || item.createdAt,
    saveHouseholdItem,
  )
}

async function syncCollections(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const localItems = await getAllCollections()
  return syncStore<RecipeCollection>(
    supabase, code, direction, 'collections', localItems,
    c => c.id,
    c => c.updatedAt,
    saveCollection,
  )
}

// Settings fields that are safe to share across a household — excludes API keys,
// theme, and other per-device/personal fields (see runSync for the full list).
const SYNCED_SETTINGS_KEYS = [
  'householdName', 'unitSystem', 'geminiModel', 'nutrientToggles', 'macroHistoryDays',
  'storePreferenceEnabled', 'householdSize', 'people', 'setupComplete',
  'ingredientCategories', 'recipeTags', 'brands', 'stores',
] as const

function pickSyncableSettings(settings: AppSettings): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of SYNCED_SETTINGS_KEYS) picked[key] = settings[key]
  picked.aiProvider = settings.ai.provider
  return picked
}

async function syncSettings(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
): Promise<{ uploaded: number; downloaded: number }> {
  let uploaded = 0
  let downloaded = 0
  const local = await loadSettings()
  const rowId = `${code}:settings`

  if (direction !== 'pull') {
    await upsertCloudRow(supabase, 'sync_settings', code, rowId, pickSyncableSettings(local), local.updatedAt)
    uploaded = 1
  }

  if (direction !== 'push') {
    const rows = await fetchCloudRows(supabase, 'sync_settings', code)
    const row = rows.find(r => r.id === rowId)
    if (row) {
      const cloudTime = new Date(row.updated_at).getTime()
      const localTime = new Date(local.updatedAt || 0).getTime()
      if (cloudTime > localTime) {
        const cloud = row.data as Record<string, unknown>
        const patch: Partial<AppSettings> = {}
        for (const key of SYNCED_SETTINGS_KEYS) {
          if (key in cloud) (patch as Record<string, unknown>)[key] = cloud[key]
        }
        const merged: AppSettings = { ...local, ...patch }
        if (typeof cloud.aiProvider === 'string') {
          merged.ai = { ...local.ai, provider: cloud.aiProvider as AIProvider }
        }
        await saveSettingsWithTimestamp(merged, row.updated_at)
        downloaded = 1
      }
    }
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
    const col = await syncCollections(supabase, code, direction)
    summary.addedLocally    += col.addedLocally
    summary.uploadedToCloud += col.uploadedToCloud
    summary.updatedToNewer  += col.updatedToNewer
  } catch (e) {
    summary.errors.push(`Recipe collections: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const mp = await syncMealPlans(supabase, code, direction)
    summary.addedLocally    += mp.addedLocally
    summary.uploadedToCloud += mp.uploadedToCloud
    summary.updatedToNewer  += mp.updatedToNewer
  } catch (e) {
    summary.errors.push(`Meal plans: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const gl = await syncGroceryLists(supabase, code, direction)
    summary.addedLocally    += gl.addedLocally
    summary.uploadedToCloud += gl.uploadedToCloud
    summary.updatedToNewer  += gl.updatedToNewer
  } catch (e) {
    summary.errors.push(`Grocery lists: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const hi = await syncHouseholdItems(supabase, code, direction)
    summary.addedLocally    += hi.addedLocally
    summary.uploadedToCloud += hi.uploadedToCloud
    summary.updatedToNewer  += hi.updatedToNewer
  } catch (e) {
    summary.errors.push(`Household items: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const st = await syncSettings(supabase, code, direction)
    summary.uploadedToCloud += st.uploaded
    summary.updatedToNewer  += st.downloaded
  } catch (e) {
    summary.errors.push(`Settings: ${e instanceof Error ? e.message : String(e)}`)
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
