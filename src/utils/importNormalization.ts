import { normalizeBrandName } from '@/utils/brandNormalization'
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

export function normalizeVariant(rv: RawVariant, parentId: string): IngredientVariant {
  const macros: Macros = rv.macros ?? {
    calories: rv.calories ?? 0,
    protein: rv.protein ?? 0,
    carbs: rv.carbs ?? 0,
    fiber: rv.fiber ?? 0,
    sugar: rv.sugar ?? 0,
    fat: rv.fat ?? 0,
    sodium: rv.sodium ?? 0,
    ...(rv.saturatedFat != null ? { saturatedFat: rv.saturatedFat } : {}),
    ...(rv.transFat != null ? { transFat: rv.transFat } : {}),
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

export function extractRawIngredients(data: unknown): RawIngredient[] {
  if (Array.isArray(data)) return data as RawIngredient[]
  if (data && typeof data === 'object' && Array.isArray((data as { ingredients?: unknown }).ingredients)) {
    return (data as { ingredients: RawIngredient[] }).ingredients
  }
  throw new Error('Could not find an "ingredients" list in this file. Make sure it is a JSON export from Settings → Data or an Open Food Facts converter file.')
}
