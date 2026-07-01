import { getDB } from './schema'
import type { AppSettings } from '@/types'

export const DEFAULT_SETTINGS: AppSettings = {
  householdName: '',
  unitSystem: 'imperial',
  theme: 'system',
  ai: { provider: 'none', apiKey: '' },
  usdaApiKey: '',
  geminiApiKey: '',
  geminiModel: 'gemini-flash-latest',
  nutrientToggles: {
    saturatedFat: false,
    transFat: false,
    alcohol: false,
    water: false,
    weight: false,
  },
  macroHistoryDays: 90,
  storePreferenceEnabled: false,
  householdSize: 1,
  people: [],
  setupComplete: false,
  ingredientCategories: [
    'Meat', 'Seafood', 'Dairy', 'Eggs', 'Produce', 'Frozen',
    'Pantry', 'Bakery', 'Condiments', 'Seasonings', 'Beverages',
    'Snacks', 'Canned Goods', 'Deli', 'Household',
  ],
  recipeTags: [
    { group: 'Protein', tags: ['Chicken', 'Beef', 'Pork', 'Fish', 'Shrimp', 'Turkey', 'Vegetarian', 'Vegan'] },
    { group: 'Cook Method', tags: ['Crockpot', 'Oven', 'Stovetop', 'Grill', 'Instant Pot', 'Air Fryer', 'No-Cook'] },
    { group: 'Cuisine', tags: ['American', 'Mexican', 'Italian', 'Chinese', 'Japanese', 'Thai', 'Indian', 'Greek', 'French', 'Spanish', 'Mediterranean', 'Southern', 'BBQ', 'Asian', 'Middle Eastern'] },
    { group: 'Type', tags: ['Beverages', 'Homemade', 'Dessert', 'Snack', 'Soup', 'Salad', 'Sandwich'] },
    { group: 'Extras', tags: ['Easy', 'Quick', 'Gluten-Free', 'Dairy-Free', 'Kid-Friendly', 'Meal Prep'] },
  ],
  supabaseUrl: '',
  supabaseAnonKey: '',
  householdSyncCode: '',
  familyShareCode: '',
  familyShareRole: 'owner',
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDB()
  const stored = await db.get('settings', 'app')
  if (!stored) return { ...DEFAULT_SETTINGS }
  // Merge stored over defaults to pick up any new default fields added in upgrades
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB()
  await db.put('settings', settings, 'app')
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings()
  const updated = { ...current, ...patch }
  await saveSettings(updated)
  return updated
}
