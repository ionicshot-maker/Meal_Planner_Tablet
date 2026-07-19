import type { Handler } from '@netlify/functions'

function r1(n: number): number { return Math.round(n * 10) / 10 }

const UNIT_MAP: Record<string, string> = {
  tsp: 'tsp', ts: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbs: 'tbsp', tb: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  floz: 'floz', fl: 'floz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l',
}

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

// Parse "1 tsp (2.6 g)" or "1/4 cup" or "100 ml" → { size, unit }
function parseServingLabel(label: string | undefined): { size: number; unit: string } | null {
  if (!label?.trim()) return null
  const cleaned = label.replace(/\([^)]*\)/g, '').trim()
  const m = cleaned.match(/^([\d./\s]+?)\s*([a-zA-Z]+)\s*$/)
  if (!m) return null
  const numStr = m[1].trim()
  const unitRaw = m[2].toLowerCase()
  let size: number
  if (numStr.includes('/')) {
    const [num, den] = numStr.split('/')
    size = parseFloat(num) / parseFloat(den)
  } else {
    size = parseFloat(numStr)
  }
  if (!isFinite(size) || size <= 0) return null
  return { size, unit: UNIT_MAP[unitRaw] ?? 'g' }
}

// Default serving sizes when OFF has no serving data for a product
function categoryDefaultServing(categories: string[]): { servingG: number; displaySize: number; displayUnit: string } {
  const tags = categories.map(t => t.toLowerCase())
  const isSpice = tags.some(t =>
    t.includes('spice') || t.includes('seasoning') || t.includes('herb') ||
    t.includes('cinnamon') || t.includes('pepper') || t.includes('cumin') ||
    t.includes('turmeric') || t.includes('paprika') || t.includes('garlic') ||
    t.includes('ginger') || t.includes('oregano') || t.includes('basil') ||
    t.includes('thyme') || t.includes('nutmeg') || t.includes('clove') ||
    t.includes('cayenne') || t.includes('chili') || t.includes('ground-spice')
  )
  if (isSpice) return { servingG: 2.6, displaySize: 1, displayUnit: 'tsp' }

  const isSauce = tags.some(t =>
    t.includes('sauce') || t.includes('dressing') || t.includes('condiment') ||
    t.includes('syrup') || t.includes('marinade')
  )
  if (isSauce) return { servingG: 15, displaySize: 1, displayUnit: 'tbsp' }

  return { servingG: 100, displaySize: 100, displayUnit: 'g' }
}

const handler: Handler = async (event) => {
  const barcode = event.queryStringParameters?.barcode?.trim()

  if (!barcode) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Missing barcode parameter' }) }
  }

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AngeloFamilyMealPlanner/1.0 (ionicshot@gmail.com)' },
    })

    if (!res.ok) {
      return { statusCode: res.status, headers: NO_CACHE, body: JSON.stringify({ error: `Open Food Facts returned ${res.status}` }) }
    }

    const raw = await res.json() as { status: number; product?: Record<string, unknown> }

    if (raw.status !== 1 || !raw.product) {
      return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
    }

    const p = raw.product
    const nm = ((p.nutriments ?? {}) as Record<string, number>)
    const categories = (p.categories_tags ?? []) as string[]

    // Log raw product and serving fields so we can diagnose any product
    console.log('[barcode-lookup] barcode:', barcode)
    console.log('[barcode-lookup] product_name:', p.product_name)
    console.log('[barcode-lookup] product_name_en:', p.product_name_en)
    console.log('[barcode-lookup] serving_size:', p.serving_size)
    console.log('[barcode-lookup] serving_quantity:', p.serving_quantity)
    console.log('[barcode-lookup] serving_quantity_unit:', p.serving_quantity_unit)
    console.log('[barcode-lookup] product_quantity:', p.product_quantity)
    console.log('[barcode-lookup] number_of_servings:', p.number_of_servings)
    console.log('[barcode-lookup] categories_tags (first 6):', categories.slice(0, 6))

    // ── Resolve serving gram-weight ──────────────────────────────────────────
    // 1. serving_quantity (most reliable — gram weight of the serving)
    let servingG: number | null = null
    if (typeof p.serving_quantity === 'number' && (p.serving_quantity as number) > 0) {
      servingG = p.serving_quantity as number
    }

    // 2. product_quantity ÷ number_of_servings
    if (servingG === null) {
      const rawQty = p.product_quantity
      const rawSvg = p.number_of_servings
      const prodQty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty ?? ''))
      const numSvgs = typeof rawSvg === 'number' ? rawSvg : parseFloat(String(rawSvg ?? ''))
      if (isFinite(prodQty) && prodQty > 0 && isFinite(numSvgs) && numSvgs > 0) {
        servingG = prodQty / numSvgs
        console.log('[barcode-lookup] servingG derived from product_quantity/number_of_servings:', servingG)
      }
    }

    // 3. Category-based default (e.g. Seasonings → 1 tsp = 2.6 g)
    let categoryDefault: ReturnType<typeof categoryDefaultServing> | null = null
    if (servingG === null) {
      categoryDefault = categoryDefaultServing(categories)
      servingG = categoryDefault.servingG
      console.log('[barcode-lookup] servingG from category default:', servingG, 'category default:', categoryDefault)
    }

    console.log('[barcode-lookup] final servingG:', servingG)

    // ── Resolve display serving label ────────────────────────────────────────
    const labelServing = parseServingLabel(p.serving_size as string | undefined)
    const servingDisplaySize = labelServing?.size ?? categoryDefault?.displaySize ?? servingG
    const servingDisplayUnit = labelServing?.unit ?? categoryDefault?.displayUnit ?? 'g'
    console.log('[barcode-lookup] display serving:', servingDisplaySize, servingDisplayUnit)

    // ── Scale macros from per-100g to per-serving ────────────────────────────
    const scale = servingG / 100
    const hasServingKeys =
      (nm['energy-kcal_serving'] ?? 0) > 0 || (nm['proteins_serving'] ?? 0) > 0

    const macros = hasServingKeys ? {
      calories:     r1(nm['energy-kcal_serving'] ?? 0),
      protein:      r1(nm['proteins_serving'] ?? 0),
      carbs:        r1(nm['carbohydrates_serving'] ?? 0),
      fiber:        r1(nm['fiber_serving'] ?? 0),
      sugar:        r1(nm['sugars_serving'] ?? 0),
      fat:          r1(nm['fat_serving'] ?? 0),
      sodium:       r1((nm['sodium_serving'] ?? 0) * 1000),
      saturatedFat: (nm['saturated-fat_serving'] ?? 0) || undefined,
    } : {
      calories:     r1((nm['energy-kcal_100g'] ?? nm['energy-kcal'] ?? 0) * scale),
      protein:      r1((nm['proteins_100g'] ?? 0) * scale),
      carbs:        r1((nm['carbohydrates_100g'] ?? 0) * scale),
      fiber:        r1((nm['fiber_100g'] ?? 0) * scale),
      sugar:        r1((nm['sugars_100g'] ?? 0) * scale),
      fat:          r1((nm['fat_100g'] ?? 0) * scale),
      sodium:       r1((nm['sodium_100g'] ?? 0) * scale * 1000),
      saturatedFat: ((nm['saturated-fat_100g'] ?? 0) * scale) || undefined,
    }

    console.log('[barcode-lookup] macros:', macros)

    // Nutriscore ('a'..'e' lowercase in OFF) and Nova group (1-4) pass straight through;
    // allergens_tags looks like ["en:milk","en:soy"] — strip the locale prefix and title-case.
    const nutriscoreRaw = (p.nutriscore_grade as string | undefined)?.toUpperCase()
    const nutriscore = nutriscoreRaw && ['A', 'B', 'C', 'D', 'E'].includes(nutriscoreRaw) ? nutriscoreRaw : undefined
    const novaGroupRaw = p.nova_group
    const novaGroup = typeof novaGroupRaw === 'number' && novaGroupRaw >= 1 && novaGroupRaw <= 4 ? novaGroupRaw : undefined
    const allergensTags = (p.allergens_tags ?? []) as string[]
    const allergens = allergensTags.map(t =>
      t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    )

    const normalized = {
      product_name:         (p.product_name || p.product_name_en || '') as string,
      brands:               (p.brands || '') as string,
      categories_tags:      categories,
      serving_display_size: servingDisplaySize,
      serving_display_unit: servingDisplayUnit,
      serving_quantity_g:   servingG,
      macros,
      barcode:              barcode,
      nutriscore,
      novaGroup,
      allergens,
    }

    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ status: 1, product: normalized }),
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers: NO_CACHE,
      body: JSON.stringify({ error: 'Upstream request failed', details: String(err) }),
    }
  }
}

export { handler }
