interface CategoryRule {
  category: string
  keywords: string[]
}

const BEAN_KEYWORDS = ['bean', 'pea', 'lentil', 'chickpea', 'legume']

// Priority-ordered — first matching rule wins. Mirrors the keyword categorization
// used by the external Open Food Facts bulk-converter tool, so ingredients coming
// in through either path land in the same category. Beverages is checked first so
// genuine beverages (water, juice, energy drinks, etc.) never get reclassified by a
// coincidental keyword match further down the list. Packaged Meals and Soups & Broths
// are checked before Pasta & Noodles / Dry Beans & Legumes / Meat & Poultry so a
// product like "Chicken Noodle Soup" or "Maruchan Ramen Noodles" — which matches
// several rules' keywords at once — lands on the category that actually describes
// the product rather than an ingredient mentioned in its name.
export const CATEGORY_RULES: CategoryRule[] = [
  { category: 'Beverages', keywords: [
    'water', 'juice', 'tea', 'coffee', 'soda', 'energy drink', 'alani', 'celsius',
    'gatorade', 'soft drink', 'sports drink', 'lemonade', 'kombucha', 'cold brew',
  ] },
  { category: 'Packaged Meals', keywords: ['ramen', 'instant noodle', 'maruchan', 'helper', 'meal kit', 'instant meal'] },
  { category: 'Soups & Broths', keywords: ['soup', 'broth', 'bouillon'] },
  { category: 'Pasta & Noodles', keywords: ['pasta', 'spaghetti', 'penne', 'rigatoni', 'noodle', 'macaroni', 'lasagna'] },
  { category: 'Bread & Bakery', keywords: ['bread', 'tortilla', 'bagel', 'bun', 'roll', 'muffin', 'wrap'] },
  { category: 'Breakfast & Cereal', keywords: ['oatmeal', 'oat', 'cereal', 'granola', 'grits'] },
  { category: 'Rice & Grains', keywords: ['rice'] },
  { category: 'Dry Beans & Legumes', keywords: BEAN_KEYWORDS },
  { category: 'Snacks', keywords: ['chip', 'cracker', 'cookie', 'pretzel', 'snack', 'nut', 'pistachio', 'almond', 'pecan'] },
  { category: 'Condiments & Sauces', keywords: ['ketchup', 'sauce', 'dressing', 'mustard', 'mayo', 'salsa', 'marinade', 'vinegar'] },
  { category: 'Seasonings & Spices', keywords: ['seasoning', 'spice', 'pepper', 'salt', 'cumin', 'paprika', 'oregano'] },
  { category: 'Dairy', keywords: ['butter', 'cheese', 'milk', 'cream', 'yogurt', 'dairy'] },
  { category: 'Seafood', keywords: ['fish', 'salmon', 'tuna', 'shrimp'] },
  { category: 'Meat & Poultry', keywords: ['chicken', 'beef', 'pork', 'turkey', 'meat'] },
]

// A "frozen" item matching one of these categories is ambiguous rather than
// miscategorized — "Frozen Peas", "Frozen Lasagna", "Frozen Waffles", "Frozen Bean
// Burritos" etc. are common, correctly-categorized "Frozen" products whose names
// happen to share a keyword with a pantry-staple category. Meat/seafood/dairy/
// snacks/condiments/seasonings/beverages keywords are still trusted for frozen
// items (a "Frozen Chicken Breast" really does belong in Meat & Poultry).
const FROZEN_AMBIGUOUS_CATEGORIES = new Set([
  'Soups & Broths', 'Pasta & Noodles', 'Bread & Bakery', 'Breakfast & Cereal',
  'Rice & Grains', 'Dry Beans & Legumes',
])

// Categories that historically absorbed items indiscriminately — either as a direct
// carry-over from the old 15-category set, or via inconsistent bulk imports — and so
// are worth re-checking against a matched ingredient name. Categories not in this set
// (Pasta & Noodles, Condiments & Sauces, Canned Goods, etc.) are trusted as already
// specific and left alone even if a keyword happens to match elsewhere.
export const RECLASSIFIABLE_CATEGORIES = new Set([
  'Baking & Pantry', 'Meat & Poultry', 'Seasonings & Spices', 'Bread & Bakery',
  'Produce', 'Dairy', 'Frozen', 'Snacks', 'Beverages',
])

// Whole-word match with an optional trailing "s" so plurals ("beans", "chips") match
// without a naive substring check catching unrelated words ("pea" inside "peanut",
// "nut" inside "nutmeg", "oat" inside "goat").
function wordMatch(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}s?\\b`, 'i').test(name)
}

// Suggests a category for an ingredient name using the priority-ordered rules above.
// Returns undefined when nothing matches — callers should leave the existing
// category alone in that case rather than force a default.
export function suggestCategory(name: string): string | undefined {
  // Canned beans/peas/lentils/chickpeas belong with other canned goods rather than
  // dry pantry staples — checked before the generic legume rule below.
  if (wordMatch(name, 'canned') && BEAN_KEYWORDS.some(k => wordMatch(name, k))) {
    return 'Canned Goods'
  }
  const isFrozen = wordMatch(name, 'frozen')
  for (const rule of CATEGORY_RULES) {
    if (isFrozen && FROZEN_AMBIGUOUS_CATEGORIES.has(rule.category)) continue
    if (rule.keywords.some(k => wordMatch(name, k))) return rule.category
  }
  return undefined
}
