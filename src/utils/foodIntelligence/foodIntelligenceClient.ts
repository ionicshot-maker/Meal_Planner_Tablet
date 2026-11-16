/**
 * Food Intelligence client for Meal Planner.
 *
 * Dependency-free (uses `fetch`), written to drop into `Meal_Planner_Tablet/src/utils/`.
 * Types mirror Meal Planner's own (`IngredientUnit`, `Macros`, `GroceryItem`,
 * `IngredientVariant`) so no translation layer is needed in the app.
 *
 * Auth: pass `getToken` returning the user's Supabase access token (the API
 * reads `app_metadata.household_id` / `household_role` from it).  Catalogue and
 * shopping-maths calls are anonymous; only scanning / manual entry / receipts need it.
 *
 * Contract: `openapi.json` + `fixtures/*.json` are recorded from the real API
 * and verified by tests on both sides (see tests/test_contract_fixtures.py).
 */

// ── Meal Planner types (subset, structurally identical to src/types/index.ts) ──
export type WeightUnit = 'oz' | 'lb' | 'g' | 'kg'
export type VolumeUnit = 'tsp' | 'tbsp' | 'cup' | 'floz' | 'ml' | 'l'
export type CountUnit = 'each' | 'package' | 'jar' | 'can' | 'bag' | 'box' | 'slice' | 'piece'
export type IngredientUnit = WeightUnit | VolumeUnit | CountUnit
export type NutriscoreGrade = 'A' | 'B' | 'C' | 'D' | 'E'
export type NovaGroupNum = 1 | 2 | 3 | 4

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
}

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

/** Fields of Meal Planner's `IngredientVariant` that Food Intelligence can supply. */
export interface VariantSuggestion {
  brand: string
  defaultUnit: IngredientUnit
  servingSize: number
  servingUnit: IngredientUnit
  macros?: Macros
  packageSize?: number
  packageUnit?: IngredientUnit
  packageCost?: number
  costPerServing?: number
  store?: string
  barcode: string
  nutriscore?: NutriscoreGrade
  novaGroup?: NovaGroupNum
  allergens?: string[]
}

// ── API shapes ──────────────────────────────────────────────────────────────
export interface ApiMacros {
  basis: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fiber: number | null
  sugar: number | null
  fat: number | null
  sodium: number | null
  saturatedFat: number | null
  transFat: number | null
}

export interface VariantPricing {
  store: string | null
  storeId: string
  packageCost: number
  onSale: boolean
  regularPrice: number | null
  costPerServing: number | null
  storesPricing: number
}

export interface ApiVariant {
  barcode: string | null
  name: string
  brand: string
  servingSize: number | null
  servingUnit: string | null
  servingDisplay: string | null
  packageSize: number | null
  packageUnit: string | null
  macros: ApiMacros | null
  nutriscore: string | null
  novaGroup: number | null
  allergens: string[]
  category: string | null
  categoryCode: string | null
  domain: string
  requested?: string
  pricing?: VariantPricing | null
}

export interface AnalyzeInputItem {
  id: string
  name?: string
  barcode?: string
  quantity?: number
  unit?: IngredientUnit
}

export interface AnalyzedItem {
  id: string
  matched: boolean
  matchedBy: 'barcode' | 'exact_name' | 'unmatched'
  name?: string | null
  barcode?: string
  productName?: string
  brand?: string
  packages?: number
  packageBasis?: 'count' | 'size' | 'assumed'
  category?: string | null
  department?: string | null
  aisle?: string | null
  prices?: { storeId: string; store: string | null; unitPrice: number; onSale: boolean; lineTotal: number }[]
  best?: { storeId: string; store: string | null; unitPrice: number; onSale: boolean; lineTotal: number } | null
  unitPrice?: number | null
}

export interface GroceryAnalysis {
  items: AnalyzedItem[]
  departments: { department: string; name: string; aisle: string | null; order: number; itemIds: string[] }[]
  basket: unknown | null
  unmatched: string[]
  summary: { matched: number; unmatched: number; priced: number; estimatedTotal: number }
}

export interface RollupItem {
  gtin: string
  servings?: number
  grams?: number
  quantity?: number
  unit?: IngredientUnit
}

export interface RollupResult {
  total: Record<string, number>
  per_serving: Record<string, number> | null
  servings: number
  items: Record<string, unknown>[]
  skipped: { gtin: string; reason: string }[]
}

export class FoodIntelligenceError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'FoodIntelligenceError'
    this.status = status
    this.body = body
  }
}

export interface ClientConfig {
  baseUrl: string
  getToken?: () => string | undefined | Promise<string | undefined>
  apiKey?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const VARIANT_BATCH_LIMIT = 200

export class FoodIntelligenceClient {
  private cfg: ClientConfig
  constructor(cfg: ClientConfig) {
    this.cfg = { timeoutMs: 15000, ...cfg, baseUrl: cfg.baseUrl.replace(/\/+$/, '') }
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    const url = new URL(this.cfg.baseUrl + path)
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null) continue
      for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item))
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = await this.cfg.getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`
    if (this.cfg.apiKey) headers['X-API-Key'] = this.cfg.apiKey
    const doFetch = this.cfg.fetchImpl ?? fetch
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs)
    try {
      const res = await doFetch(url.toString(), {
        method, headers, signal: ctrl.signal, body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await res.text()
      const json: unknown = text ? JSON.parse(text) : null
      if (!res.ok) {
        const detail = (json as { detail?: unknown } | null)?.detail
        throw new FoodIntelligenceError(
          typeof detail === 'string' ? detail : `Food Intelligence request failed (${res.status})`, res.status, json)
      }
      return json as T
    } finally {
      clearTimeout(timer)
    }
  }

  /** Barcodes -> variants (+ best price). Splits into API-sized chunks transparently. */
  async variantsBatch(barcodes: string[], storeIds?: string[]): Promise<{ variants: ApiVariant[]; missing: string[] }> {
    const out = { variants: [] as ApiVariant[], missing: [] as string[] }
    const unique = [...new Set(barcodes.filter(Boolean))]
    for (let i = 0; i < unique.length; i += VARIANT_BATCH_LIMIT) {
      const part = await this.request<{ variants: ApiVariant[]; missing: string[] }>(
        'POST', '/integration/meal-planner/variants/batch',
        { barcodes: unique.slice(i, i + VARIANT_BATCH_LIMIT), store_ids: storeIds ?? [] })
      out.variants.push(...part.variants)
      out.missing.push(...part.missing)
    }
    return out
  }

  /** Match + price + organise a grocery list in one call (max 500 items). */
  analyzeGrocery(items: AnalyzeInputItem[], opts: { storeIds?: string[]; maxStores?: number; storePenalty?: number; preferredStoreId?: string } = {}): Promise<GroceryAnalysis> {
    if (items.length > 500) throw new RangeError('analyzeGrocery accepts at most 500 items per call')
    return this.request('POST', '/integration/meal-planner/grocery/analyze', {
      items, store_ids: opts.storeIds ?? [], max_stores: opts.maxStores ?? 2,
      store_penalty: opts.storePenalty ?? 0, preferred_store_id: opts.preferredStoreId ?? null,
    })
  }

  nutritionRollup(items: RollupItem[], servings = 1): Promise<RollupResult> {
    return this.request('POST', '/nutrition/rollup', { items, servings })
  }

  substitutions(barcode: string, opts: { limit?: number; excludeAllergens?: string[]; maxNova?: number; storeIds?: string[] } = {}) {
    return this.request<{ found: boolean; substitutes: (ApiVariant & { score: number; reasons: string[]; best_price: number | null; cheaper_by?: number })[] }>(
      'GET', `/catalog/substitutions/${encodeURIComponent(barcode)}`, undefined,
      { limit: opts.limit, exclude_allergen: opts.excludeAllergens, max_nova: opts.maxNova, store_id: opts.storeIds })
  }

  search(opts: { q?: string; domain?: string; category?: string; brand?: string; maxNova?: number; excludeAllergens?: string[]; limit?: number; offset?: number }) {
    return this.request<{ total: number; limit: number; offset: number; items: { gtin: string; name: string; brand: string | null }[] }>(
      'GET', '/catalog/search', undefined,
      { q: opts.q, domain: opts.domain, category: opts.category, brand: opts.brand, max_nova: opts.maxNova,
        exclude_allergen: opts.excludeAllergens, limit: opts.limit, offset: opts.offset })
  }

  resolveIngredient(q: string, limit = 10) {
    return this.request<{ query: string; ingredient: string | null; variants: ApiVariant[] }>(
      'GET', '/catalog/ingredients/resolve', undefined, { q, limit })
  }

  /** Needs a user token. 200 = known product; 202 = unknown, a discovery job was queued. */
  scan(barcode: string) {
    return this.request<{ found: boolean; product?: ApiVariant; discovery_job_id?: string }>(
      'POST', `/acquisition/scan/${encodeURIComponent(barcode)}`)
  }
}

// ── Mappers: API payloads -> Meal Planner types ───────────────────────────────
const MP_UNITS = new Set<string>(['oz', 'lb', 'g', 'kg', 'tsp', 'tbsp', 'cup', 'floz', 'ml', 'l',
  'each', 'package', 'jar', 'can', 'bag', 'box', 'slice', 'piece'])

function asUnit(u: string | null | undefined, fallback: IngredientUnit): IngredientUnit {
  if (!u) return fallback
  const norm = u === 'fl oz' ? 'floz' : u
  return (MP_UNITS.has(norm) ? norm : fallback) as IngredientUnit
}

/** API variant -> the fields of Meal Planner's `IngredientVariant` we can fill. */
export function toVariantSuggestion(v: ApiVariant): VariantSuggestion {
  const m = v.macros
  return {
    brand: v.brand ?? '',
    barcode: v.barcode ?? '',
    defaultUnit: asUnit(v.servingUnit, 'g'),
    servingSize: v.servingSize ?? 100,
    servingUnit: asUnit(v.servingUnit, 'g'),
    macros: m ? {
      calories: m.calories ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fiber: m.fiber ?? 0,
      sugar: m.sugar ?? 0, fat: m.fat ?? 0, sodium: m.sodium ?? 0,
      ...(m.saturatedFat != null ? { saturatedFat: m.saturatedFat } : {}),
      ...(m.transFat != null ? { transFat: m.transFat } : {}),
    } : undefined,
    packageSize: v.packageSize ?? undefined,
    packageUnit: v.packageSize != null ? asUnit(v.packageUnit, 'g') : undefined,
    packageCost: v.pricing?.packageCost,
    costPerServing: v.pricing?.costPerServing ?? undefined,
    store: v.pricing?.store ?? undefined,
    nutriscore: (v.nutriscore as NutriscoreGrade | null) ?? undefined,
    novaGroup: (v.novaGroup as NovaGroupNum | null) ?? undefined,
    allergens: v.allergens.length ? v.allergens : undefined,
  }
}

export interface MergeReport { updated: string[]; unmatched: string[] }

/**
 * Merge an analysis back into Meal Planner grocery items by `id`.
 * Never overwrites what the user already set: `category`, `store` and
 * `unitPrice` are only filled when empty; `brand` only when missing.
 * `unitPrice` = best line total / item quantity, so Meal Planner's `unitPrice x quantity` equals the real purchase cost.
 */
export function mergeAnalysisIntoGroceryItems(items: GroceryItem[], analysis: GroceryAnalysis): { items: GroceryItem[]; report: MergeReport } {
  const byId = new Map(analysis.items.map(a => [a.id, a]))
  const report: MergeReport = { updated: [], unmatched: [] }
  const merged = items.map(item => {
    const a = byId.get(item.id)
    if (!a || !a.matched) {
      if (a) report.unmatched.push(item.id)
      return item
    }
    const next: GroceryItem = { ...item }
    if ((!next.category || next.category === 'Other') && a.category) next.category = a.category
    // Meal Planner prices a line as unitPrice x quantity (quantity in recipe units), so the injected price
    // is the cost of the packages that must be bought, spread per unit of the item's own quantity.
    if (next.unitPrice === undefined && a.best && item.quantity > 0) {
      next.unitPrice = Math.round((a.best.lineTotal / item.quantity) * 100) / 100
    }
    if (!next.store && a.best?.store) next.store = a.best.store
    if (!next.brand && a.brand) next.brand = a.brand
    const changed = (Object.keys(next) as (keyof GroceryItem)[]).some(k => next[k] !== item[k])
    if (changed) report.updated.push(item.id)
    return next
  })
  return { items: merged, report }
}

/** Items grouped in store walking order, using the analysis' department ordering. */
export function groupItemsByDepartment(items: GroceryItem[], analysis: GroceryAnalysis) {
  const byId = new Map(items.map(i => [i.id, i]))
  const placed = new Set<string>()
  const groups = analysis.departments.map(d => {
    const members = d.itemIds.map(id => byId.get(id)).filter((i): i is GroceryItem => !!i)
    members.forEach(i => placed.add(i.id))
    return { department: d.department, name: d.name, aisle: d.aisle, items: members }
  })
  const rest = items.filter(i => !placed.has(i.id))
  return rest.length ? [...groups, { department: 'other', name: 'Other', aisle: null, items: rest }] : groups
}
