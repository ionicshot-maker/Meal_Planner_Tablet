// ─── Unit System ────────────────────────────────────────────────────────────
export type UnitSystem = 'imperial' | 'metric'

export type WeightUnit = 'oz' | 'lb' | 'g' | 'kg'
export type VolumeUnit = 'tsp' | 'tbsp' | 'cup' | 'floz' | 'ml' | 'l'
export type CountUnit = 'each' | 'package' | 'jar' | 'can' | 'bag' | 'box' | 'slice' | 'piece'
export type IngredientUnit = WeightUnit | VolumeUnit | CountUnit

// ─── Theme ──────────────────────────────────────────────────────────────────
export type ThemePreference = 'light' | 'dark' | 'system'

// ─── AI Provider ────────────────────────────────────────────────────────────
export type AIProvider = 'anthropic' | 'gemini' | 'openai' | 'ollama' | 'none'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  ollamaBaseUrl?: string
  ollamaModel?: string
}

// ─── Person / Household ─────────────────────────────────────────────────────
export type PersonMode = 'simple' | 'complex'
export type PayFrequency = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active'
export type Sex = 'male' | 'female' | 'other'

export interface PaydaySchedule {
  frequency: PayFrequency
  nextPayday: string // ISO date string
  color: string
}

export interface Person {
  id: string
  name: string
  mode: PersonMode
  // Complex mode fields
  age?: number
  weight?: number       // stored in lbs
  height?: number       // stored in inches
  sex?: Sex
  activityLevel?: ActivityLevel
  trackWater?: boolean
  trackWeight?: boolean
  paydaySchedule?: PaydaySchedule
  goalMethod?: 'individual' | 'percentage'
  goals?: NutrientGoals
}

export interface NutrientGoals {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sugar?: number
  sodium?: number
  saturatedFat?: number
  transFat?: number
  alcohol?: number
  totalCalories?: number  // used by percentage method
  proteinPct?: number
  carbsPct?: number
  fatPct?: number
}

// ─── Optional Nutrient Toggles ───────────────────────────────────────────────
export interface NutrientToggles {
  saturatedFat: boolean
  transFat: boolean
  alcohol: boolean
  water: boolean
  weight: boolean
}

// ─── Nutrition Source ────────────────────────────────────────────────────────
export type NutritionSource = 'openfoodfacts' | 'gemini' | 'usda' | 'manual'

// ─── Cloud Sync ───────────────────────────────────────────────────────────────
export type FamilyShareRole = 'owner' | 'contributor' | 'readonly'

// ─── App Settings ────────────────────────────────────────────────────────────
export interface AppSettings {
  householdName: string
  unitSystem: UnitSystem
  theme: ThemePreference
  // Device-local — deliberately excluded from cloud sync (see SYNCED_SETTINGS_KEYS
  // in db/supabase.ts) since a kitchen tablet may want larger text than a desktop.
  fontSizePt: number
  ai: AIConfig
  usdaApiKey: string
  geminiApiKey: string
  geminiModel: string
  nutrientToggles: NutrientToggles
  macroHistoryDays: number    // 90–365
  storePreferenceEnabled: boolean
  householdSize: number
  people: Person[]
  setupComplete: boolean
  ingredientCategories: string[]
  recipeTags: RecipeTagGroup[]
  brands: string[]
  stores: string[]
  starterLibrarySeeded: boolean
  starterLibraryVersion: number
  kitchenReferencePhotoPolicy: KitchenReferencePhotoPolicy
  // Cloud sync
  supabaseUrl: string
  supabaseAnonKey: string
  householdSyncCode: string
  familyShareCode: string
  familyShareRole: FamilyShareRole
  updatedAt: string
}

export interface RecipeTagGroup {
  group: string
  tags: string[]
}

// ─── Ingredient ──────────────────────────────────────────────────────────────
export interface Macros {
  calories: number
  protein: number
  carbs: number
  fiber: number
  sugar: number
  fat: number
  sodium: number
  saturatedFat?: number
  transFat?: number
  alcohol?: number
}

export interface IngredientVariant {
  id: string
  parentId: string
  brand: string
  defaultUnit: IngredientUnit
  servingSize: number
  servingUnit: IngredientUnit
  macros: Macros
  packageSize?: number
  packageUnit?: IngredientUnit
  packageCost?: number
  totalServingsInPackage?: number
  costPerServing?: number
  usdaFdcId?: number
  store?: string
  notes?: string
}

export interface Ingredient {
  id: string
  name: string
  category: string
  perishable: boolean
  frozen: boolean
  alwaysOnHand: boolean
  archived: boolean
  variants: IngredientVariant[]
  defaultVariantId: string
  createdAt: string
  updatedAt: string
}

// ─── Recipe ──────────────────────────────────────────────────────────────────
export interface RecipeIngredient {
  ingredientId?: string      // undefined = unlinked (saved but won't count toward macros/cost)
  variantId?: string
  name: string               // always present — display name and storage for unlinked rows
  quantity: number
  unit: IngredientUnit
  servingDisplay?: string    // e.g. "6oz", "1 cup"
}

export interface RecipeStep {
  id: string
  order: number
  text: string
}

export interface Recipe {
  id: string
  name: string
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  servings: number
  prepTimeMinutes: number
  cookTimeMinutes: number
  notes?: string
  photoUrl?: string
  sourceUrl?: string
  sourceName?: string
  isFavorite: boolean
  isTemplate: boolean
  macrosPerServing?: Macros
  estimatedCostPerServing?: number
  createdAt: string
  updatedAt: string
}

// ─── Meal Plan ───────────────────────────────────────────────────────────────
export type MealItemRole = 'primary' | 'side' | 'dessert'

export interface MealSlotItem {
  id: string
  role?: MealItemRole
  recipeId?: string
  isLeftover?: boolean
  leftoverFromDate?: string
  leftoverMealSlot?: string
  isManual?: boolean
  manualMacros?: Macros
  manualLabel?: string
  shared: boolean
  individualAssignments?: Record<string, string>  // personId → recipeId
}

export interface DayMeals {
  breakfast: MealSlotItem[]
  lunch: MealSlotItem[]
  dinner: MealSlotItem[]
  snacks: MealSlotItem[]
  drinks?: MealSlotItem[]
}

export interface MealPlanDay {
  date: string     // ISO date string
  meals: DayMeals
  updatedAt?: string
}

export interface MealPlanWeekTemplate {
  id: string
  name: string
  days: MealPlanDay[]
  createdAt: string
}

// ─── Macro Log ───────────────────────────────────────────────────────────────
export interface MacroLogEntry {
  id: string
  date: string
  personId: string
  mealSlot: string          // 'breakfast'|'lunch'|'dinner'|'snacks'|'__water__'|'__weight__'|custom
  mealSlotItemId?: string   // MealSlotItem.id — matches plan item to log entry
  label?: string            // display name (recipe name or manual label)
  recipeId?: string
  variantId?: string
  servingsEaten: number
  macros: Macros            // per-serving macros at time of logging
  waterOz?: number
  weightLbs?: number
  isManual: boolean
  createdAt: string
}

// ─── Household Items ─────────────────────────────────────────────────────────
export interface HouseholdItem {
  id: string
  name: string
  category: string
  brand?: string
  store?: string
  price?: number
  notes?: string
  alwaysOnHand?: boolean
  createdAt: string
  updatedAt?: string
}

// ─── Recipe Collections ───────────────────────────────────────────────────────
export interface RecipeCollection {
  id: string
  name: string
  recipeIds: string[]
  createdAt: string
  updatedAt: string
}

// ─── Kitchen Reference ─────────────────────────────────────────────────────────
export type ReferenceContentType =
  | 'tips' | 'herbs' | 'pantry' | 'measurements' | 'charts' | 'presentation' | 'terms' | 'notes'

// Whether to keep the original scanned photo after Gemini extracts its text —
// 'ask' prompts per-scan, 'keep'/'discard' apply automatically every time.
export type KitchenReferencePhotoPolicy = 'ask' | 'keep' | 'discard'

export interface KitchenReference {
  id: string
  title: string
  contentType: ReferenceContentType
  sourceTags: string[]
  content: string           // formatted text — supports bullet/numbered lines
  tableData?: string[][]    // present when contentType is a chart/table
  photoUrl?: string
  createdAt: string
  updatedAt: string
}

// ─── Grocery List ─────────────────────────────────────────────────────────────
export interface GroceryItem {
  id: string
  ingredientId?: string
  variantId?: string
  name: string
  quantity: number
  unit: IngredientUnit
  category: string
  brand?: string
  store?: string
  unitPrice?: number
  checked: boolean
  partiallyBought: boolean
  purchasedQuantity?: number
  isManual: boolean
}

export interface GroceryList {
  id: string
  startDate: string
  endDate: string
  generatedAt: string
  items: GroceryItem[]
  manualItems: GroceryItem[]
  remainderItems: GroceryItem[]
  status: 'active' | 'completed' | 'archived'
  updatedAt?: string
}
