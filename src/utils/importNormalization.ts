import { normalizeBrandName } from '@/utils/brandNormalization'
import { findSmartMatches } from '@/utils/smartDuplicate'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientVariant, IngredientUnit, Macros, NutriscoreGrade, NovaGroupNum } from '@/types'

// ─── Loosely-typed shapes for the two accepted JSON formats ───────────────────
// 1. This app's own Settings → Data → Export format: variants already carry a
//    nested `macros` object matching our IngredientVariant shape.
// 2. An Open Food Facts bulk-converter format: variants carry flat macro
//    fields (calories, protein, ...) plus renamed fields like
//    `storePreference` / `packageServings` instead of `store` / `totalServingsInPackage`.
export interface RawVariant {
  id?: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  defaultUnit?: string
  macros?: Macros
  calories?: number
  protein?: number
  carbs?: number
  fiber?: number
  sugar?: number
  fat?: number
  saturatedFat?: number | null
  transFat?: number | null
  sodium?: number
  packageCost?: number | null
  totalServingsInPackage?: number | null
  packageServings?: number | null
  costPerServing?: number | null
  priceLastUpdated?: string | null
  store?: string | null
  storePreference?: string | null
  usdaFdcId?: number | null
  notes?: string | null
  nutriscore?: string | null
  novaGroup?: number | null
  allergens?: string[] | null
  perishable?: boolean
  frozen?: boolean
  alwaysOnHand?: boolean
}

export interface RawIngredient {
  id?: string
  name?: string
  category?: string
  perishable?: boolean
  frozen?: boolean
  alwaysOnHand?: boolean
  archived?: boolean
  createdAt?: string
  updatedAt?: string
  defaultVariantId?: string
  variants?: RawVariant[]
}

const NUTRISCORE_GRADES = new Set(['A', 'B', 'C', 'D', 'E'])

// Prefers a genuinely nonzero value over a zero/missing one, checking `nested`
// (variant.macros.<field>) before `flat` (variant.<field>). A raw record can carry
// BOTH shapes at once — e.g. a nested macros object with everything defaulted to 0
// alongside real values still sitting in the old flat fields from a prior import —
// and plain `rv.macros ?? {...flat}` would keep the zeroed nested object and never
// look at the flat fields, since a present-but-empty object is still truthy. Only
// falls through when both sides agree there's genuinely nothing (both zero/missing),
// so a real, legitimate 0 (salt, a zero-calorie soda) is never overwritten.
function pickMacro(nested: number | undefined, flat: number | undefined): number {
  if (nested != null && nested !== 0) return nested
  if (flat != null && flat !== 0) return flat
  return nested ?? flat ?? 0
}

export function normalizeVariant(rv: RawVariant, parentId: string): IngredientVariant {
  const nestedMacros = rv.macros
  const macros: Macros = {
    calories: pickMacro(nestedMacros?.calories, rv.calories),
    protein: pickMacro(nestedMacros?.protein, rv.protein),
    carbs: pickMacro(nestedMacros?.carbs, rv.carbs),
    fiber: pickMacro(nestedMacros?.fiber, rv.fiber),
    sugar: pickMacro(nestedMacros?.sugar, rv.sugar),
    fat: pickMacro(nestedMacros?.fat, rv.fat),
    sodium: pickMacro(nestedMacros?.sodium, rv.sodium),
    ...((nestedMacros?.saturatedFat ?? rv.saturatedFat) != null
      ? { saturatedFat: pickMacro(nestedMacros?.saturatedFat, rv.saturatedFat ?? undefined) } : {}),
    ...((nestedMacros?.transFat ?? rv.transFat) != null
      ? { transFat: pickMacro(nestedMacros?.transFat, rv.transFat ?? undefined) } : {}),
  }
  const totalServingsInPackage = rv.totalServingsInPackage ?? rv.packageServings ?? undefined
  const store = rv.store ?? rv.storePreference ?? undefined
  const nutriscoreRaw = rv.nutriscore?.toUpperCase()
  const nutriscore = nutriscoreRaw && NUTRISCORE_GRADES.has(nutriscoreRaw) ? (nutriscoreRaw as NutriscoreGrade) : undefined
  const novaGroup = rv.novaGroup != null && rv.novaGroup >= 1 && rv.novaGroup <= 4 ? (rv.novaGroup as NovaGroupNum) : undefined
  const priceLastUpdated = rv.priceLastUpdated ?? (rv.packageCost != null ? now() : undefined)

  return {
    id: rv.id || newId(),
    parentId,
    brand: normalizeBrandName(rv.brand) || 'Generic',
    defaultUnit: (rv.defaultUnit || rv.servingUnit || 'g') as IngredientUnit,
    servingSize: rv.servingSize ?? 100,
    servingUnit: (rv.servingUnit || rv.defaultUnit || 'g') as IngredientUnit,
    macros,
    ...(rv.packageCost != null ? { packageCost: rv.packageCost } : {}),
    ...(totalServingsInPackage != null ? { totalServingsInPackage } : {}),
    ...(rv.costPerServing != null ? { costPerServing: rv.costPerServing } : {}),
    ...(priceLastUpdated ? { priceLastUpdated } : {}),
    ...(rv.usdaFdcId != null ? { usdaFdcId: rv.usdaFdcId } : {}),
    ...(store ? { store } : {}),
    ...(rv.notes ? { notes: rv.notes } : {}),
    ...(rv.barcode ? { barcode: rv.barcode } : {}),
    ...(nutriscore ? { nutriscore } : {}),
    ...(novaGroup ? { novaGroup } : {}),
    ...(rv.allergens && rv.allergens.length > 0 ? { allergens: rv.allergens } : {}),
  }
}

export function normalizeIngredient(raw: RawIngredient): Ingredient | null {
  const name = raw.name?.trim()
  if (!name || !Array.isArray(raw.variants) || raw.variants.length === 0) return null

  const id = raw.id || newId()
  const variants = raw.variants.map(v => normalizeVariant(v, id))
  const first = raw.variants[0]

  return {
    id,
    name,
    category: raw.category || 'Baking & Pantry',
    perishable: raw.perishable ?? first.perishable ?? false,
    frozen: raw.frozen ?? first.frozen ?? false,
    alwaysOnHand: raw.alwaysOnHand ?? first.alwaysOnHand ?? false,
    archived: raw.archived ?? false,
    variants,
    defaultVariantId: raw.defaultVariantId && variants.some(v => v.id === raw.defaultVariantId)
      ? raw.defaultVariantId
      : variants[0].id,
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || now(),
  }
}

// Find the existing ingredient (if any) an imported/seeded item matches, using
// the same priority order used everywhere else in the app: barcode first
// (strongest signal — skips name comparison entirely when it hits), then
// exact name, then (optionally) fuzzy name match. Shared by JsonImportTab and
// any other bulk-import/seed path (e.g. brandedLibrary.ts) so matching
// behavior can't drift between them.
//
// `fuzzy` defaults to on, but both current callers (JSON Import, the branded
// starter pack) explicitly opt out with `{ fuzzy: false }` — fuzzy-matching
// real multi-word branded product names ("Whole Milk", "Creamy Peanut
// Butter") against the small *generic* starter set's short single-concept
// names ("Milk", "Butter") produced a very high false-positive rate
// (verified: ~330-420 of 867 items wrongly "matched" and silently skipped),
// and the same underlying keyword-subset/edit-distance logic separately
// caused JSON Import to false-positive on a real 366-item USDA import
// (2026-07-24) before that caller was also switched to `fuzzy: false`.
// Barcode + exact name are precise enough to still
// catch real duplicates (a re-run of the same seed, an item already
// hand-added) without that collateral damage.
export function findIngredientMatch(
  item: Ingredient,
  workingList: Ingredient[],
  barcodeIndex: Map<string, Ingredient>,
  options: { fuzzy?: boolean } = {},
): Ingredient | undefined {
  for (const v of item.variants) {
    if (v.barcode && barcodeIndex.has(v.barcode)) return barcodeIndex.get(v.barcode)
  }
  const norm = item.name.trim().toLowerCase()
  const exact = workingList.find(i => i.name.trim().toLowerCase() === norm)
  if (exact) return exact
  if (options.fuzzy === false) return undefined
  return findSmartMatches(item.name, workingList)[0]
}

export function extractRawIngredients(data: unknown): RawIngredient[] {
  if (Array.isArray(data)) return data as RawIngredient[]
  if (data && typeof data === 'object' && Array.isArray((data as { ingredients?: unknown }).ingredients)) {
    return (data as { ingredients: RawIngredient[] }).ingredients
  }
  throw new Error('Could not find an "ingredients" list in this file. Make sure it is a JSON export from Settings → Data or an Open Food Facts converter file.')
}
