/**
 * Food Intelligence variant -> Meal Planner `NormalizedProduct` (the shape `BarcodeTab` and the
 * Receipt Scanner already consume), so scanning needs no new UI.  Category and non-food handling
 * deliberately go through Meal Planner's OWN `mapOFFCategoryToApp` / `isLikelyNonFood`
 * by emitting tags those functions understand - no category logic is duplicated here.
 */
import type { NormalizedProduct } from '@/utils/barcodeLookup'
import type { ApiVariant, NovaGroupNum, NutriscoreGrade } from './foodIntelligenceClient.ts'
import { guarded } from './resilient.ts'
import type { GuardDeps } from './resilient.ts'

const NON_FOOD_TAG: Record<string, string> = {
  household: 'household', cleaning: 'cleaning', pet: 'pet-food', personal_care: 'personal-care',
  baby: 'household', health: 'personal care',
}

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

export function variantToNormalizedProduct(v: ApiVariant): NormalizedProduct | null {
  if (!v.barcode || !v.name) return null
  const m = v.macros
  // Per-100 g/ml macros must travel with a 100-unit serving; per-serving macros keep their serving.
  const per100 = !!m && m.basis.startsWith('per_100')
  const servingUnit = per100 ? (m!.basis === 'per_100ml' ? 'ml' : 'g') : (v.servingUnit === 'ml' ? 'ml' : 'g')
  const servingSize = per100 ? 100 : (v.servingSize ?? 100)
  const tags: string[] = []
  if (v.categoryCode) tags.push(v.categoryCode, v.categoryCode.replace(/-/g, ' '))
  if (NON_FOOD_TAG[v.domain]) tags.push(NON_FOOD_TAG[v.domain])
  return {
    product_name: v.name,
    brands: v.brand ?? '',
    categories_tags: tags,
    serving_display_size: servingSize,
    serving_display_unit: servingUnit,
    serving_quantity_g: servingSize,
    macros: {
      calories: m?.calories ?? 0, protein: m?.protein ?? 0, carbs: m?.carbs ?? 0, fiber: m?.fiber ?? 0,
      sugar: m?.sugar ?? 0, fat: m?.fat ?? 0, sodium: m?.sodium ?? 0,
      ...(m?.saturatedFat != null ? { saturatedFat: m.saturatedFat } : {}),
    },
    barcode: v.barcode,
    ...(v.nutriscore ? { nutriscore: v.nutriscore as NutriscoreGrade } : {}),
    ...(v.novaGroup ? { novaGroup: v.novaGroup as NovaGroupNum } : {}),
    allergens: v.allergens.map(titleCase),
  }
}

/**
 * Optional barcode enhancement.  Resolves a product ONLY when Food Intelligence is configured,
 * reachable and knows the barcode; otherwise `null` and the caller keeps its existing lookup.
 */
export async function lookupViaFoodIntelligence(barcode: string, deps?: GuardDeps): Promise<NormalizedProduct | null> {
  const res = await guarded(c => c.variantsBatch([barcode]), deps)
  const variant = res?.variants[0]
  return variant ? variantToNormalizedProduct(variant) : null
}
