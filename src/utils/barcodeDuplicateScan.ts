import { getAllIngredients } from '@/db/ingredients'

export interface BarcodeDupeEntry {
  ingredientId: string
  ingredientName: string
  category: string
  variantId: string
  brand: string
  rawBarcode: string
}

export interface BarcodeDupeGroup {
  normalizedBarcode: string
  entries: BarcodeDupeEntry[]
}

// Finds variants whose barcodes are identical once leading zeros are
// stripped, but different as raw strings — the exact pattern the Ingredient
// Converter's pre-v5 float/int barcode bug produced (see script.py and
// MealPlannerApp_Reference.md). A group where every entry already shares the
// same raw string is a plain, unrelated duplicate (already catchable by
// ordinary barcode matching elsewhere) — only groups with more than one
// distinct raw string are surfaced here.
export async function findLeadingZeroBarcodeDupes(): Promise<BarcodeDupeGroup[]> {
  const ingredients = await getAllIngredients(false)
  const byNormalized = new Map<string, BarcodeDupeEntry[]>()

  for (const ing of ingredients) {
    for (const v of ing.variants) {
      const raw = v.barcode?.trim()
      if (!raw) continue
      const normalized = raw.replace(/^0+/, '')
      if (!normalized) continue // all-zero string isn't a real barcode identity

      const entry: BarcodeDupeEntry = {
        ingredientId: ing.id,
        ingredientName: ing.name,
        category: ing.category,
        variantId: v.id,
        brand: v.brand,
        rawBarcode: raw,
      }
      const list = byNormalized.get(normalized)
      if (list) list.push(entry)
      else byNormalized.set(normalized, [entry])
    }
  }

  const groups: BarcodeDupeGroup[] = []
  for (const [normalizedBarcode, entries] of byNormalized) {
    const distinctRaw = new Set(entries.map(e => e.rawBarcode))
    if (distinctRaw.size > 1) groups.push({ normalizedBarcode, entries })
  }
  return groups.sort((a, b) => b.entries.length - a.entries.length)
}
