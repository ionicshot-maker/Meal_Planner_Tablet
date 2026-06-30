import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface GeminiNutrition {
  calories: number
  protein: number
  carbs: number
  fiber: number
  sugar: number
  fat: number
  sodium: number
  servingSize?: number
  servingUnit?: string
  notFound?: boolean
}

const handler: Handler = async (event) => {
  const { productName, brand, apiKey } = event.queryStringParameters ?? {}

  if (!productName?.trim()) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Missing productName parameter' }) }
  }
  if (!apiKey?.trim()) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'No Gemini API key configured' }) }
  }

  const nameWithBrand = brand?.trim() ? `${brand.trim()} ${productName.trim()}` : productName.trim()

  const prompt = `You are a nutrition database. Return ONLY a valid JSON object with nutrition facts for "${nameWithBrand}" exactly as they appear on the product label or as accurately as possible.

Use this exact schema:
{
  "calories": number (kcal per serving),
  "protein": number (grams per serving, 1 decimal),
  "carbs": number (grams per serving, 1 decimal),
  "fiber": number (grams per serving, 1 decimal),
  "sugar": number (grams per serving, 1 decimal),
  "fat": number (grams per serving, 1 decimal),
  "sodium": number (mg per serving),
  "servingSize": number (e.g. 1, 100, 0.25),
  "servingUnit": string (e.g. "g", "oz", "tsp", "tbsp", "cup", "ml")
}

If you cannot find reliable nutrition data for this specific product, return: {"notFound": true}
Return ONLY the JSON object with no explanation, no markdown, no code fences.`

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[gemini-nutrition] API error:', res.status, errText)
      return { statusCode: res.status, headers: NO_CACHE, body: JSON.stringify({ error: `Gemini API returned ${res.status}` }) }
    }

    const raw = await res.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    console.log('[gemini-nutrition] raw response for:', nameWithBrand, text)

    let nutrition: GeminiNutrition
    try {
      nutrition = JSON.parse(text) as GeminiNutrition
    } catch {
      return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Failed to parse Gemini response', raw: text }) }
    }

    if (nutrition.notFound) {
      return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
    }

    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ status: 1, nutrition }),
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
