import { getDB } from './schema'
import { now } from '@/utils/ids'
import type { AppSettings, RecipeTagGroup } from '@/types'

export const DEFAULT_SETTINGS: AppSettings = {
  householdName: '',
  unitSystem: 'imperial',
  theme: 'system',
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
    'Meat', 'Seafood', 'Dairy', 'Eggs', 'Produce', 'Frozen',
    'Pantry', 'Bakery', 'Condiments', 'Seasonings', 'Beverages',
    'Snacks', 'Canned Goods', 'Deli', 'Household',
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
  supabaseUrl: '',
  supabaseAnonKey: '',
  householdSyncCode: '',
  familyShareCode: '',
  familyShareRole: 'owner',
  updatedAt: new Date(0).toISOString(),
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
