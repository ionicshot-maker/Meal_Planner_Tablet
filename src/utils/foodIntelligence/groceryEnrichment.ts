/**
 * Optional grocery-list enrichment.  Returns the list UNCHANGED (same reference) whenever Food
 * Intelligence is not configured, offline, failing, or has nothing to add - so generation behaves
 * exactly as before.  When it does answer, only EMPTY fields are filled (category, store, unit price,
 * brand); user and Meal Planner data always win.
 */
import type { GroceryList, Ingredient } from '@/types'
import { mergeAnalysisIntoGroceryItems } from './foodIntelligenceClient.ts'
import type { AnalyzeInputItem, GroceryItem } from './foodIntelligenceClient.ts'
import { guarded, readConfig } from './resilient.ts'
import type { GuardDeps } from './resilient.ts'

export async function enrichGroceryList(
  list: GroceryList,
  loadIngredients: () => Promise<Ingredient[]>,
  deps: GuardDeps = {},
): Promise<GroceryList> {
  try {
    // Cheap exit first: when unconfigured we must not even touch the database.
    if ((deps.config === undefined ? readConfig() : deps.config) === null) return list
    const ingredients = await loadIngredients()
    const barcodeByVariant = new Map<string, string>()
    for (const ing of ingredients) for (const v of ing.variants) if (v.barcode) barcodeByVariant.set(v.id, v.barcode)

    const items: AnalyzeInputItem[] = []
    for (const it of list.items) {
      const barcode = it.variantId ? barcodeByVariant.get(it.variantId) : undefined
      if (!it.isManual && barcode) items.push({ id: it.id, barcode, quantity: it.quantity, unit: it.unit })
    }
    if (!items.length) return list

    const analysis = await guarded((c, cfg) => c.analyzeGrocery(items.slice(0, 500), { storeIds: cfg.storeIds }), deps)
    if (!analysis) return list
    const { items: merged, report } = mergeAnalysisIntoGroceryItems(list.items as GroceryItem[], analysis)
    return report.updated.length ? { ...list, items: merged as typeof list.items } : list
  } catch {
    return list   // enrichment must never break list generation
  }
}
