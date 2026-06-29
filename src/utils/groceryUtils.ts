import type {
  MealPlanDay, Recipe, Ingredient, GroceryItem, GroceryList, IngredientUnit
} from '@/types'
import { formatQuantity } from './units'

export interface AggregatedItem {
  ingredientId: string
  variantId?: string
  name: string
  category: string
  quantity: number
  unit: IngredientUnit
  store?: string
  alwaysOnHand: boolean
}

export function consolidateIngredients(
  days: MealPlanDay[],
  recipeMap: Map<string, Recipe>,
  ingredientMap: Map<string, Ingredient>
): AggregatedItem[] {
  // Count how many times each recipe is used across all slots in the range
  const recipeCount = new Map<string, number>()
  for (const day of days) {
    for (const slot of [day.meals.breakfast, day.meals.lunch, day.meals.dinner, day.meals.snacks]) {
      for (const item of slot) {
        if (item.recipeId && !item.isLeftover) {
          recipeCount.set(item.recipeId, (recipeCount.get(item.recipeId) ?? 0) + 1)
        }
      }
    }
  }

  // Aggregate ingredients across all recipe uses
  const aggregated = new Map<string, AggregatedItem>()
  for (const [recipeId, count] of recipeCount) {
    const recipe = recipeMap.get(recipeId)
    if (!recipe) continue
    for (const ri of recipe.ingredients) {
      if (!ri.ingredientId) continue
      const ing = ingredientMap.get(ri.ingredientId)
      if (!ing) continue
      const key = `${ri.ingredientId}::${ri.variantId ?? ''}::${ri.unit}`
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += ri.quantity * count
      } else {
        const variant = ri.variantId
          ? ing.variants.find(v => v.id === ri.variantId)
          : ing.variants[0]
        aggregated.set(key, {
          ingredientId: ri.ingredientId,
          variantId: ri.variantId,
          name: ing.name,
          category: ing.category || 'Other',
          quantity: ri.quantity * count,
          unit: ri.unit,
          store: variant?.store,
          alwaysOnHand: ing.alwaysOnHand,
        })
      }
    }
  }

  return Array.from(aggregated.values()).sort((a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )
}

export function aggToGroceryItem(agg: AggregatedItem): GroceryItem {
  return {
    id: crypto.randomUUID(),
    ingredientId: agg.ingredientId,
    variantId: agg.variantId,
    name: agg.name,
    quantity: Math.round(agg.quantity * 100) / 100,
    unit: agg.unit,
    category: agg.category,
    store: agg.store,
    checked: false,
    partiallyBought: false,
    isManual: false,
  }
}

export function groupByCategory(items: GroceryItem[]): [string, GroceryItem[]][] {
  const map = new Map<string, GroceryItem[]>()
  for (const item of items) {
    const cat = item.category || 'Other'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(item)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

export function groupByStore(items: GroceryItem[]): [string, GroceryItem[]][] {
  const map = new Map<string, GroceryItem[]>()
  for (const item of items) {
    const store = item.store || 'No store specified'
    if (!map.has(store)) map.set(store, [])
    map.get(store)!.push(item)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

export function generatePrintHTML(list: GroceryList, groupedItems: [string, GroceryItem[]][], householdName = ''): string {
  const dateRange = `${list.startDate} – ${list.endDate}`
  const listTitle = householdName.trim() ? `${householdName.trim()} Grocery List` : 'Grocery List'
  const generatedDate = new Date(list.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const itemRows = (items: GroceryItem[]) => items
    .map(item => `
      <div class="item ${item.checked ? 'checked' : ''}">
        <div class="cb"></div>
        <span class="name">${item.name}${item.partiallyBought ? ' <em>(partly bought)</em>' : ''}</span>
        <span class="qty">${formatQuantity(item.quantity, item.unit)}</span>
        ${item.store ? `<span class="store">${item.store}</span>` : ''}
      </div>`)
    .join('')

  const categorySections = groupedItems
    .map(([cat, items]) => `
      <div class="category-block">
        <div class="category-header">${cat}</div>
        ${itemRows(items)}
      </div>`)
    .join('')

  const allManual = [...list.manualItems]
  const manualSection = allManual.length > 0 ? `
    <div class="category-block">
      <div class="category-header">Other / Manual Items</div>
      ${itemRows(allManual)}
    </div>` : ''

  const remainderSection = list.remainderItems.length > 0 ? `
    <div class="section-break"></div>
    <h2 class="section-heading">Remainder Items</h2>
    ${list.remainderItems.map(item => `
      <div class="item">
        <div class="cb"></div>
        <span class="name">${item.name}</span>
        <span class="qty">${formatQuantity(item.quantity, item.unit)} remaining</span>
      </div>`).join('')}` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${listTitle} — ${dateRange}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; padding: 24px; max-width: 760px; margin: 0 auto; }
  header { margin-bottom: 20px; border-bottom: 2px solid #c8a870; padding-bottom: 12px; }
  h1 { font-size: 20pt; font-weight: bold; margin-bottom: 4px; }
  .meta { font-size: 9pt; color: #666; }
  .category-block { margin-bottom: 16px; break-inside: avoid; }
  .category-header { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px; }
  .item { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
  .cb { width: 13px; height: 13px; border: 1.5px solid #333; border-radius: 3px; flex-shrink: 0; margin-top: 2px; }
  .name { flex: 1; font-size: 10.5pt; }
  .qty { font-size: 9.5pt; color: #555; white-space: nowrap; }
  .store { font-size: 8.5pt; color: #888; }
  .checked .name { text-decoration: line-through; color: #999; }
  .section-break { border-top: 2px solid #ddd; margin: 20px 0 16px; }
  .section-heading { font-size: 13pt; font-weight: bold; margin-bottom: 10px; }
  @media print {
    body { padding: 12px; }
    .category-block { break-inside: avoid; }
    @page { margin: 1.5cm; @bottom-center { content: counter(page) ' of ' counter(pages); font-size: 9pt; color: #888; } }
  }
</style>
</head>
<body>
<header>
  <h1>${listTitle}</h1>
  <div class="meta">Shopping window: ${dateRange} &nbsp;&middot;&nbsp; Generated ${generatedDate}</div>
</header>
${categorySections}
${manualSection}
${remainderSection}
</body>
</html>`
}
