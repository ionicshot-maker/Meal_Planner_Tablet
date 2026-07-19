import { getDB } from './schema'
import { now } from '@/utils/ids'
import type { AppSettings, RecipeTagGroup } from '@/types'

export const DEFAULT_SETTINGS: AppSettings = {
  householdName: '',
  unitSystem: 'imperial',
  theme: 'system',
  fontSizePt: 14,
  ai: { provider: 'none', apiKey: '' },
  usdaApiKey: '',
  geminiApiKey: '',
  geminiModel: 'gemini-3.1-flash-lite',
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
    'Meat & Poultry', 'Seafood', 'Dairy', 'Eggs', 'Produce', 'Canned Goods',
    'Dry Beans & Legumes', 'Pasta & Noodles', 'Rice & Grains', 'Bread & Bakery',
    'Breakfast & Cereal', 'Snacks', 'Frozen', 'Beverages', 'Condiments & Sauces',
    'Seasonings & Spices', 'Baking & Pantry', 'Soups & Broths', 'Packaged Meals',
    'Deli & Prepared', 'Household Items',
  ],
  recipeTags: [
    { group: 'Protein',     tags: ['Chicken', 'Beef', 'Pork', 'Fish', 'Shrimp', 'Turkey', 'Lamb', 'Vegetarian', 'Vegan', 'Seafood', 'Eggs', 'Tofu', 'Beans', 'Peanut Butter', 'Beverages'] },
    { group: 'Cook Method', tags: ['Crockpot', 'Oven', 'Stovetop', 'Grill', 'Instant Pot', 'Air Fryer', 'No-Cook', 'Smoker'] },
    { group: 'Cuisine',     tags: ['American', 'Mexican', 'Italian', 'Chinese', 'Japanese', 'Thai', 'Indian', 'Greek', 'French', 'Spanish', 'Mediterranean', 'Southern', 'BBQ', 'Asian', 'Middle Eastern'] },
    { group: 'Source',      tags: ['Family Recipe', 'Pinterest', 'AllRecipes', 'Food Network', 'Better Homes and Gardens', 'Paula Deen', 'Pioneer Woman', 'Tasty', 'YouTube', 'Cookbook', 'Personal Creation'] },
    { group: 'Type',        tags: ['Beverages', 'Homemade', 'Dessert', 'Snack', 'Soup', 'Salad', 'Sandwich'] },
    { group: 'Extras',      tags: ['Easy', 'Quick', 'Gluten-Free', 'Dairy-Free', 'Kid-Friendly', 'Meal Prep', 'High Protein'] },
  ],
  brands: [
    "365 by Whole Foods Market", "Annie's", "Applegate", "Arrowhead Mills", "Austin",
    "Back to Nature", "Bagel Bites", "Ball Park", "Barilla", "Bear Naked",
    "Betty Crocker", "Birds Eye", "Blue Diamond", "Bob Evans", "Bob's Red Mill",
    "Boar's Head", "Borden", "Breakstone's", "Breyers", "Bush's",
    "Campbell's", "Casa Fiesta", "Cavendish Farms", "Chobani", "Clif Bar",
    "Coca-Cola", "ConAgra", "Country Crock", "Cracker Barrel", "Daisy",
    "Del Monte", "Dole", "Domino", "Dорitos", "Dr Pepper",
    "Duncan Hines", "Earth Balance", "Earthbound Farm", "Eden Foods", "Eggo",
    "Enjoy Life", "Fairlife", "Far East", "Filippo Berio", "Fisher",
    "Fleischmann's", "Folgers", "Food Club", "Fritos", "Gatorade",
    "General Mills", "Gold Medal", "Good & Gather", "Gorton's", "Great Value",
    "Green Giant", "Häagen-Dazs", "Healthy Choice", "Hebrew National", "Heinz",
    "Hidden Valley", "Hills Bros", "Hillshire Farm", "Horizon Organic", "Hunt's",
    "Idahoan", "Imagine Foods", "Impossible Foods", "Jell-O", "Jennie-O",
    "Jimmy Dean", "Johnsonville", "Jose Ole", "Kashi", "Kellogg's",
    "Kettle Brand", "Kirkland Signature", "Knorr", "Kraft", "Kroger",
    "Land O'Lakes", "Land O Frost", "Lay's", "Lean Cuisine", "Lightlife",
    "Lipton", "Little Debbie", "Lucerne", "Lundberg", "Marie Callender's",
    "Market Pantry", "McCormick", "Minute Maid", "Minute Rice", "Mission",
    "Morningstar Farms", "Morton", "Mt. Olive", "Nature Valley", "Nestlé",
    "Newman's Own", "Noodles & Company", "Nutter Butter", "Ocean Spray", "Oikos",
    "Old El Paso", "Old Orchard", "Open Nature", "Ore-Ida", "Oreo",
    "Oscar Mayer", "Pacific Foods", "Pepperidge Farm", "Pepsi", "Perdue",
    "Peter Pan", "Philadelphia", "Pillsbury", "Prego", "Pringles",
    "Private Selection", "Progresso", "Publix", "Quaker", "Ragú",
    "Ranch Style", "Ready Pac", "Red Baron", "Rice-A-Roni", "Ronzoni",
    "Sabra", "Sargento", "Schweppes", "Scott's", "Silk",
    "Simple Truth", "Simply Orange", "Skippy", "Smart Balance", "Snapple",
    "Snyders of Hanover", "So Delicious", "Spartan", "Starbucks", "Stonyfield",
    "Stouffer's", "Stubb's", "Sun-Maid", "Swanson", "Taco Bell",
    "Texas Pete", "The Spice Hunter", "Tillamook", "Totino's", "Tropicana",
    "Tyson", "Uncle Ben's", "V8", "Van Camp's", "Van's",
    "Vlasic", "Walnut Acres", "Welch's", "Western Family", "Wholly Guacamole",
    "Wild Harvest", "Wish-Bone", "Wonderful Pistachios", "Yoplait", "Zatarain's",
  ],
  stores: [
    "Aldi", "Amazon Fresh", "Costco", "Dollar General", "Dollar Tree",
    "Food Lion", "Fred Meyer", "Giant", "H-E-B", "HEB",
    "Hannaford", "Harris Teeter", "Hy-Vee", "Ingles", "Kroger",
    "Lidl", "Meijer", "Publix", "Safeway", "Sam's Club",
    "Sprouts", "Stop & Shop", "Target", "Trader Joe's", "Walmart",
    "Whole Foods", "Winn-Dixie",
  ],
  starterLibrarySeeded: false,
  starterLibraryVersion: 0,
  kitchenReferencePhotoPolicy: 'ask',
  ingredientDisplay: {
    showNutriscore: true,
    showNovaGroup: true,
    showAllergens: true,
  },
  allergenWatchList: [],
  miscategoryFixed: false,
  categoryFixRulesVersion: 0,
  supabaseUrl: '',
  supabaseAnonKey: '',
  householdSyncCode: '',
  familyShareCode: '',
  familyShareRole: 'owner',
  updatedAt: new Date(0).toISOString(),
}

// Maps every category name from the old 15-category set to its new expanded-category
// counterpart. Entries that already match a new category name (Seafood, Eggs, etc.) map
// to themselves so the migration below can treat "known old name" and "already current"
// uniformly. This is a blanket rename only — "Pantry" in particular was a catch-all
// that held everything from condiments to pasta to spice blends, so renaming it to
// "Baking & Pantry" is just step one; fixMiscategorizedIngredients() (db/ingredients.ts)
// runs right after and re-sorts individual ingredients by name via categoryRules.ts.
export const CATEGORY_MIGRATION_MAP: Record<string, string> = {
  'Meat': 'Meat & Poultry',
  'Seafood': 'Seafood',
  'Dairy': 'Dairy',
  'Eggs': 'Eggs',
  'Produce': 'Produce',
  'Frozen': 'Frozen',
  'Pantry': 'Baking & Pantry',
  'Bakery': 'Bread & Bakery',
  'Condiments': 'Condiments & Sauces',
  'Seasonings': 'Seasonings & Spices',
  'Beverages': 'Beverages',
  'Snacks': 'Snacks',
  'Canned Goods': 'Canned Goods',
  'Deli': 'Deli & Prepared',
  'Household': 'Household Items',
}

// One-time migration for the ingredient-category expansion (old 15 → new 21 names).
// Updates the household's stored category list in place (new defaults plus any custom
// categories they'd added that aren't part of the built-in set) and remaps every
// ingredient's `category` field via CATEGORY_MIGRATION_MAP. Cheap no-op once everything
// already uses the new names — safe to call on every app load.
export async function migrateIngredientCategories(): Promise<{ categoriesUpdated: boolean; ingredientsRemapped: number }> {
  const settings = await loadSettings()
  const custom = settings.ingredientCategories.filter(
    c => !(c in CATEGORY_MIGRATION_MAP) && !DEFAULT_SETTINGS.ingredientCategories.includes(c)
  )
  const mergedCategories = [...DEFAULT_SETTINGS.ingredientCategories, ...custom]
  const categoriesUpdated = mergedCategories.length !== settings.ingredientCategories.length
    || mergedCategories.some((c, i) => c !== settings.ingredientCategories[i])
  if (categoriesUpdated) {
    await saveSettings({ ...settings, ingredientCategories: mergedCategories })
  }

  const db = await getDB()
  const allIngredients = await db.getAll('ingredients')
  let ingredientsRemapped = 0
  for (const ingredient of allIngredients) {
    const mapped = CATEGORY_MIGRATION_MAP[ingredient.category]
    if (mapped && mapped !== ingredient.category) {
      ingredient.category = mapped
      ingredient.updatedAt = new Date().toISOString()
      await db.put('ingredients', ingredient)
      ingredientsRemapped++
    }
  }

  return { categoriesUpdated, ingredientsRemapped }
}

function mergeDefaultTags(current: RecipeTagGroup[]): RecipeTagGroup[] {
  const result = [...current]
  for (const dflt of DEFAULT_SETTINGS.recipeTags) {
    const existing = result.find(g => g.group === dflt.group)
    if (!existing) {
      result.push({ ...dflt })
    } else {
      const missingTags = dflt.tags.filter(
        dt => !existing.tags.some(t => t.toLowerCase() === dt.toLowerCase())
      )
      if (missingTags.length > 0) {
        const idx = result.indexOf(existing)
        result[idx] = { ...existing, tags: [...existing.tags, ...missingTags] }
      }
    }
  }
  return result
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDB()
  const stored = await db.get('settings', 'app')
  if (!stored) return { ...DEFAULT_SETTINGS }
  // Merge stored over defaults to pick up any new default fields added in upgrades
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...stored }
  // Restore any missing default recipe tags (adds back deleted groups/tags without removing custom ones)
  merged.recipeTags = mergeDefaultTags(merged.recipeTags)
  return merged
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB()
  settings.updatedAt = now()
  await db.put('settings', settings, 'app')
}

// Used when applying a cloud settings merge, where we want to preserve the
// cloud row's timestamp rather than stamping "now" so future comparisons stay accurate.
export async function saveSettingsWithTimestamp(settings: AppSettings, updatedAt: string): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...settings, updatedAt }, 'app')
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings()
  const updated = { ...current, ...patch }
  await saveSettings(updated)
  return updated
}
