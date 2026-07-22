import { newId, now } from './ids'
import type { Ingredient, IngredientUnit, Macros, NutriscoreGrade, NovaGroupNum } from '@/types'

export const DEFAULT_CATEGORIES = [
  'Meat & Poultry', 'Seafood', 'Dairy', 'Eggs', 'Produce', 'Canned Goods',
  'Dry Beans & Legumes', 'Pasta & Noodles', 'Rice & Grains', 'Bread & Bakery',
  'Breakfast & Cereal', 'Snacks', 'Frozen', 'Beverages', 'Condiments & Sauces',
  'Seasonings & Spices', 'Baking & Pantry', 'Soups & Broths', 'Packaged Meals',
  'Deli & Prepared', 'Household Items',
]

// Keywords that mark a product as non-food — shared by two callers: mapping
// an Open Food Facts category to "Household Items" when that category is
// configured, and (independent of the user's category list) flagging a
// looked-up product as non-food so a receipt line doesn't get force-filled
// with zeroed nutrition or waved through as a food ingredient.
const NON_FOOD_KEYWORDS = [
  'household', 'cleaning', 'paper towel', 'foil', 'trash bag', 'plastic wrap',
  'personal-care', 'personal care', 'cosmetic', 'beauty', 'hygiene',
  'detergent', 'soap', 'shampoo', 'conditioner', 'toothpaste', 'deodorant',
  'diaper', 'pet-food', 'pet care', 'laundry', 'dish-soap', 'toilet-paper',
  'toilet paper', 'tissue', 'paper-product', 'battery', 'light-bulb',
  'candle', 'office-supply', 'stationery',
]

export function isLikelyNonFood(offCategories: string[]): boolean {
  const tags = offCategories.map(t => t.toLowerCase())
  return NON_FOOD_KEYWORDS.some(k => tags.some(t => t.includes(k)))
}

// Order matters: more specific categories are checked before broader ones that
// share keywords (e.g. "soup"/"bean" would otherwise be caught by Canned Goods
// before Soups & Broths / Dry Beans & Legumes get a chance; Seasonings before
// Condiments since many spice products carry a "condiment" tag in OFF).
export function mapOFFCategoryToApp(offCategories: string[], appCategories: string[]): string {
  const tags = offCategories.map(t => t.toLowerCase())
  const checks: [string[], string][] = [
    [['meat', 'beef', 'pork', 'poultry', 'chicken', 'turkey'], 'Meat & Poultry'],
    [['seafood', 'fish', 'shrimp', 'salmon', 'tuna'], 'Seafood'],
    [['dairy', 'milk', 'cheese', 'yogurt', 'butter', 'cream'], 'Dairy'],
    [['egg'], 'Eggs'],
    [['produce', 'vegetable', 'fruit', 'fresh'], 'Produce'],
    [['frozen'], 'Frozen'],
    [['soup', 'broth', 'stock'], 'Soups & Broths'],
    [['bean', 'legume', 'lentil', 'chickpea'], 'Dry Beans & Legumes'],
    [['pasta', 'noodle', 'macaroni', 'spaghetti'], 'Pasta & Noodles'],
    [['rice', 'grain', 'quinoa', 'oat', 'barley', 'couscous'], 'Rice & Grains'],
    [['bread', 'bakery', 'bagel', 'muffin', 'pastry', 'baked'], 'Bread & Bakery'],
    [['cereal', 'breakfast', 'granola', 'pancake', 'waffle'], 'Breakfast & Cereal'],
    [['spice', 'seasoning', 'herb', 'cinnamon', 'garlic', 'paprika', 'cumin', 'turmeric',
      'oregano', 'basil', 'thyme', 'ginger', 'nutmeg', 'cloves', 'chili', 'cayenne',
      'salt', 'pepper', 'ground-spice'], 'Seasonings & Spices'],
    [['sauce', 'condiment', 'dressing', 'ketchup', 'mustard', 'mayo', 'salsa', 'vinegar', 'marinade'], 'Condiments & Sauces'],
    [['beverage', 'drink', 'juice', 'soda', 'water', 'coffee', 'tea'], 'Beverages'],
    [['snack', 'chip', 'cracker', 'cookie', 'candy', 'chocolate'], 'Snacks'],
    [['ready meal', 'frozen dinner', 'meal kit', 'packaged meal'], 'Packaged Meals'],
    [['canned', 'tomato'], 'Canned Goods'],
    [['deli', 'cold cut', 'lunch meat', 'prepared'], 'Deli & Prepared'],
    [['household', 'cleaning', 'paper towel', 'foil', 'trash bag'], 'Household Items'],
  ]
  for (const [keywords, cat] of checks) {
    if (keywords.some(k => tags.some(t => t.includes(k)))) {
      if (appCategories.includes(cat)) return cat
    }
  }
  return appCategories[0] ?? 'Baking & Pantry'
}

export interface NormalizedProduct {
  product_name: string
  brands: string
  categories_tags: string[]
  serving_display_size: number
  serving_display_unit: string
  serving_quantity_g: number
  macros: Macros
  barcode?: string
  nutriscore?: NutriscoreGrade
  novaGroup?: NovaGroupNum
  allergens?: string[]
}

export function isMacrosIncomplete(macros: Macros): boolean {
  return (macros.calories ?? 0) === 0
      && (macros.protein  ?? 0) === 0
      && (macros.carbs    ?? 0) === 0
      && (macros.fat      ?? 0) === 0
}

export function normalizedToIngredient(product: NormalizedProduct, categories: string[]): Ingredient {
  const variantId    = newId()
  const ingredientId = newId()
  const brand    = product.brands.split(',')[0].trim() || 'Generic'
  const category = mapOFFCategoryToApp(product.categories_tags, categories)
  const unit     = product.serving_display_unit as IngredientUnit

  return {
    id: ingredientId,
    name: product.product_name || 'Unknown Product',
    category,
    perishable: false,
    frozen: false,
    alwaysOnHand: false,
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    defaultVariantId: variantId,
    variants: [{
      id: variantId,
      parentId: ingredientId,
      brand,
      defaultUnit: unit,
      servingSize: product.serving_display_size,
      servingUnit: unit,
      macros: product.macros,
      ...(product.barcode ? { barcode: product.barcode } : {}),
      ...(product.nutriscore ? { nutriscore: product.nutriscore } : {}),
      ...(product.novaGroup ? { novaGroup: product.novaGroup } : {}),
      ...(product.allergens && product.allergens.length > 0 ? { allergens: product.allergens } : {}),
    }],
  }
}

export interface BarcodeLookupResult {
  status: 'found' | 'not-found' | 'non-food' | 'error'
  product?: NormalizedProduct
  errorMessage?: string
}

// The same Open Food Facts lookup BarcodeTab.tsx uses — factored out here so
// any other import flow (the Receipt Scanner) calls the identical source and
// logic rather than re-implementing it. Flags a non-food result explicitly
// rather than handing back zeroed macros for something like a bottle of dish
// soap.
export async function lookupBarcodeProduct(barcode: string): Promise<BarcodeLookupResult> {
  try {
    const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}`)
    const json = await res.json() as { status: number; product?: NormalizedProduct; error?: string }
    if (!res.ok || json.status !== 1 || !json.product) {
      return { status: 'not-found' }
    }
    if (isLikelyNonFood(json.product.categories_tags)) {
      return { status: 'non-food', product: json.product }
    }
    return { status: 'found', product: json.product }
  } catch (err) {
    return { status: 'error', errorMessage: err instanceof Error ? err.message : String(err) }
  }
}
