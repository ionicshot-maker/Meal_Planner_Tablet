interface CategoryRule {
  category: string
  keywords: string[]
  // Checked FIRST, before this rule's own keywords — if any negative keyword
  // matches the name, this rule is skipped entirely for that name (evaluation
  // continues to the next rule in priority order). Used for categories whose
  // positive keywords are broad enough to misfire on unrelated products.
  negativeKeywords?: string[]
  // If any of these match, the negativeKeywords guard above is skipped — for
  // words unambiguous enough that no non-Beverages product would plausibly be
  // named with them, even alongside a negative keyword (e.g. "Donut Shop" is a
  // real coffee brand name, so "coffee"/"cold brew" should win over "donut").
  overrideKeywords?: string[]
}

const BEAN_KEYWORDS = ['bean', 'pea', 'lentil', 'chickpea', 'legume']

// Words that show up constantly in non-beverage product names (baked goods, snacks,
// pantry staples) but happen to share a positive Beverages keyword with a real drink
// somewhere in the name, or would otherwise tempt a future keyword addition — e.g.
// "Blueberry Donut Holes" is not a beverage just because it's fruit-flavored, and
// "Coconut Oil" is not a beverage just because "Coconut Water" is.
const BEVERAGES_NEGATIVE_KEYWORDS = [
  'flour', 'oil', 'seed', 'nut', 'walnut', 'pecan', 'almond', 'flatbread', 'bread',
  'naan', 'pizza', 'donut', 'cake', 'brownie', 'granola', 'waffle', 'pancake',
  'muffin', 'cookie', 'cracker', 'chip', 'pretzel', 'hummus', 'couscous', 'oatnut',
  'krispie', 'frosted', 'streusel', 'batter', 'fries', 'cupcake', 'loaf',
]

// Same idea for Produce — there is no positive "this name sounds like Produce"
// keyword list in CATEGORY_RULES (fruit/vegetable names are far too open-ended to
// enumerate), so items land in Produce only via import-time guesses that are often
// wrong. Every word below already has a correct positive home in another category
// below, so an ingredient matching one of these is guaranteed to get sorted
// somewhere specific rather than staying miscategorized as Produce. Exported for
// consistency/documentation rather than active use — Produce has no positive
// keyword list of its own to guard.
export const PRODUCE_NEGATIVE_KEYWORDS = [
  'donut', 'candy', 'chocolate', 'ranch', 'dressing', 'oil', 'spray', 'jam', 'jelly',
  'gelatin', 'pudding', 'cake', 'cupcake', 'pancake', 'waffle', 'pizza', 'burrito',
  'pie', 'cookie', 'cracker', 'loaf', 'muffin', 'pretzel', 'brownie', 'shake', 'protein',
]

// Priority-ordered — first matching rule wins. Mirrors the keyword categorization
// used by the external Open Food Facts bulk-converter tool, so ingredients coming
// in through either path land in the same category. Beverages is checked first so
// genuine beverages (water, juice, energy drinks, etc.) never get reclassified by a
// coincidental keyword match further down the list — but its negativeKeywords guard
// runs before even that, so a fruit/bakery/pantry item that happens to share a word
// with a drink doesn't get claimed here. Packaged Meals, the frozen-only "pot pie"
// rule, and Soups & Broths are checked before Pasta & Noodles / Dry Beans & Legumes /
// Meat & Poultry so a product like "Chicken Noodle Soup" or "Maruchan Ramen Noodles"
// — which matches several rules' keywords at once — lands on the category that
// actually describes the product rather than an ingredient mentioned in its name.
export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Beverages',
    keywords: [
      'water', 'juice', 'tea', 'coffee', 'soda', 'energy drink', 'alani', 'celsius',
      'gatorade', 'soft drink', 'sports drink', 'lemonade', 'kombucha', 'cold brew',
      'creamer', 'starry', '7up', 'protein shake', 'k-cup', 'kcup',
    ],
    negativeKeywords: BEVERAGES_NEGATIVE_KEYWORDS,
    overrideKeywords: ['coffee', 'cold brew', 'k-cup', 'kcup'],
  },
  { category: 'Packaged Meals', keywords: ['ramen', 'instant noodle', 'maruchan', 'helper', 'meal kit', 'instant meal', 'pizza', 'burrito'] },
  { category: 'Frozen', keywords: ['pot pie'] },
  { category: 'Soups & Broths', keywords: ['soup', 'broth', 'bouillon'] },
  { category: 'Pasta & Noodles', keywords: ['pasta', 'spaghetti', 'penne', 'rigatoni', 'noodle', 'macaroni', 'lasagna'] },
  { category: 'Bread & Bakery', keywords: ['bread', 'tortilla', 'bagel', 'bun', 'roll', 'muffin', 'wrap', 'flatbread', 'naan', 'loaf'] },
  { category: 'Breakfast & Cereal', keywords: ['oatmeal', 'oat', 'cereal', 'granola', 'grits', 'pancake', 'waffle'] },
  { category: 'Rice & Grains', keywords: ['rice'] },
  { category: 'Dry Beans & Legumes', keywords: BEAN_KEYWORDS },
  { category: 'Snacks', keywords: [
    'chip', 'cracker', 'cookie', 'pretzel', 'snack', 'nut', 'pistachio', 'almond', 'pecan',
    'donut', 'walnut', 'peanut', 'candy', 'cake', 'cupcake', 'brownie', 'gelatin', 'pudding',
  ] },
  { category: 'Condiments & Sauces', keywords: ['ketchup', 'sauce', 'dressing', 'mustard', 'mayo', 'salsa', 'marinade', 'vinegar', 'jam', 'jelly', 'applesauce', 'ranch'] },
  { category: 'Seasonings & Spices', keywords: ['seasoning', 'spice', 'pepper', 'salt', 'cumin', 'paprika', 'oregano'] },
  { category: 'Baking & Pantry', keywords: ['flour', 'oil', 'spray', 'flaxseed', 'chia seed'] },
  { category: 'Dairy', keywords: ['butter', 'cheese', 'milk', 'cream', 'yogurt', 'dairy'] },
  { category: 'Seafood', keywords: ['fish', 'salmon', 'tuna', 'shrimp'] },
  { category: 'Meat & Poultry', keywords: ['chicken', 'beef', 'pork', 'turkey', 'meat'] },
]

// A "frozen" item matching one of these categories is ambiguous rather than
// miscategorized — "Frozen Peas", "Frozen Lasagna", "Frozen Waffles", "Frozen
// Pizza", "Frozen Bean Burritos" etc. are common, correctly-categorized "Frozen"
// products whose names happen to share a keyword with a pantry-staple or
// packaged-meal category. Meat/seafood/dairy/snacks/condiments/seasonings/
// beverages keywords are still trusted for frozen items (a "Frozen Chicken Breast"
// really does belong in Meat & Poultry).
const FROZEN_AMBIGUOUS_CATEGORIES = new Set([
  'Soups & Broths', 'Pasta & Noodles', 'Bread & Bakery', 'Breakfast & Cereal',
  'Rice & Grains', 'Dry Beans & Legumes', 'Packaged Meals',
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
    const overridden = rule.overrideKeywords?.some(k => wordMatch(name, k))
    if (!overridden && rule.negativeKeywords?.some(k => wordMatch(name, k))) continue
    if (rule.keywords.some(k => wordMatch(name, k))) return rule.category
  }
  return undefined
}
