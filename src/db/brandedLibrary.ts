import { getAllIngredients, saveIngredient } from './ingredients'
import { normalizeIngredient, extractRawIngredients, findIngredientMatch } from '@/utils/importNormalization'
import type { Ingredient } from '@/types'

// Served as a static file rather than bundled into the JS build — at ~1.1MB
// for 867 items, importing it as a module would bloat every page's initial
// bundle for data only a fraction of users will ever opt into. Fetched once,
// only when the user explicitly requests this pack (see StarterLibraryPrompt).
const DATA_URL = '/data/great-value-starter.json'

// Shown in the opt-in prompt before the file is ever fetched, so this needs to
// be kept in sync by hand if the underlying file's item count changes — the
// actual seed logic below is fully data-driven regardless of this constant.
export const BRANDED_LIBRARY_COUNT = 867

export interface BrandedSeedResult {
  added: number
  skipped: number
}

// Unlike seedStarterLibrary()'s simple exact-name-match dedup, this reuses the
// barcode → exact-name matching used by the JSON Import tab (findIngredientMatch)
// — this pack carries real barcodes, so that's a much stronger signal than the
// name-only check the generic starter set uses. Fuzzy matching is
// deliberately turned off here (see findIngredientMatch's comment) — it
// false-positived heavily against the tiny generic starter set's short
// names, which would have silently dropped a large fraction of this pack
// and defeated the "separate, not merged" point of having two packs at all.
// Always "add new only": an existing match is left completely alone, never
// updated/overwritten — loading this pack can only ever add ingredients,
// never change ones you already have.
export async function seedBrandedLibrary(): Promise<BrandedSeedResult> {
  const res = await fetch(DATA_URL)
  if (!res.ok) throw new Error(`Could not load the branded ingredient pack (${res.status}).`)
  const raw = extractRawIngredients(await res.json())
  const items = raw.map(normalizeIngredient).filter((x): x is Ingredient => x !== null)

  const existing = await getAllIngredients(true)
  const workingList = [...existing]
  const barcodeIndex = new Map<string, Ingredient>()
  for (const ing of workingList) {
    for (const v of ing.variants) if (v.barcode) barcodeIndex.set(v.barcode, ing)
  }

  let added = 0, skipped = 0
  for (const item of items) {
    const target = findIngredientMatch(item, workingList, barcodeIndex, { fuzzy: false })
    if (target) {
      skipped++
      continue
    }
    await saveIngredient(item)
    added++
    workingList.push(item)
    for (const v of item.variants) if (v.barcode) barcodeIndex.set(v.barcode, item)
  }

  return { added, skipped }
}
