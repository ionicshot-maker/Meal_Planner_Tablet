import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface RequestBody {
  productName?: string
  brand?: string
  apiKey?: string
  model?: string
}

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: NO_CACHE, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body: RequestBody = {}
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody
  } catch {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const productName = body.productName?.trim()
  const brand       = body.brand?.trim() ?? ''
  const apiKey      = body.apiKey?.trim()
  const model       = body.model?.trim() || 'gemini-flash-latest'

  if (!productName) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Missing productName' }) }
  }
  if (!apiKey) {
    return {
      statusCode: 400,
      headers: NO_CACHE,
      body: JSON.stringify({ error: 'No Gemini API key configured. Go to Settings → Integrations to add your free key.' }),
    }
  }

  const keyLen = apiKey.length
  const keyPrefix = apiKey.slice(0, 8)
  const keyHasWhitespace = apiKey !== apiKey.trim()
  console.log(
    '[gemini-nutrition] lookup:', productName,
    '| brand:', brand || '(none)',
    '| model:', model,
    '| key prefix:', keyPrefix + '…',
    '| key length:', keyLen,
    '| key has whitespace:', keyHasWhitespace,
  )

  if (keyLen < 20) {
    console.error('[gemini-nutrition] API key appears too short. Length:', keyLen)
    return {
      statusCode: 400,
      headers: NO_CACHE,
      body: JSON.stringify({ error: 'Gemini API key appears invalid (too short). Check Settings → Integrations.' }),
    }
  }

  const nameWithBrand = brand ? `${brand} ${productName}` : productName

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
  "servingSize": number (numeric quantity, e.g. 85, 1, 0.25),
  "servingUnit": string — MUST be one of exactly: "tsp", "tbsp", "cup", "floz", "oz", "g", "kg", "ml", "l", "lb", "each", "package", "jar", "can", "bag", "box", "slice", "piece"
}

CRITICAL rules for servingSize and servingUnit:
- Return the serving size in the EXACT unit shown on the label or the standard unit for the food — do NOT convert between units.
- Use "g" when the serving weight is in grams (e.g. 85g → servingSize: 85, servingUnit: "g").
- Use "oz" ONLY when the label explicitly lists the serving in ounces AND the value is a small number (e.g. 1 oz, 1.5 oz, 3 oz).
- A servingSize greater than 30 with servingUnit "oz" is almost certainly wrong — serving sizes in ounces are typically 1–6 oz; if the value is above 30 use "g" instead.
- Use "ml" for liquids measured in milliliters, "l" for liters, "cup"/"tbsp"/"tsp" for volume measures.
- Use "can", "jar", "bag", "box", "package" for whole-container servings when no specific weight is listed.
- Never mix units: never return a gram value labelled as oz, or vice versa.

If you cannot find reliable nutrition data for this specific product, return: {"notFound": true}
Return ONLY the JSON object with no explanation, no markdown, no code fences.`

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  console.log('[gemini-nutrition] calling:', geminiUrl)

  try {
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    console.log('[gemini-nutrition] HTTP status:', res.status, res.statusText)

    if (!res.ok) {
      const errText = await res.text()
      console.error('[gemini-nutrition] error body:', errText)

      let geminiMessage = ''
      try {
        const parsed = JSON.parse(errText) as { error?: { message?: string; status?: string; code?: number } }
        geminiMessage = parsed.error?.message ?? ''
        console.error('[gemini-nutrition] parsed error — code:', parsed.error?.code, '| status:', parsed.error?.status, '| message:', geminiMessage)
      } catch {
        console.error('[gemini-nutrition] could not parse error body as JSON')
      }

      if (res.status === 429) {
        return {
          statusCode: 429,
          headers: NO_CACHE,
          body: JSON.stringify({
            error: `Gemini rate limit or quota exceeded for model "${model}". Try a different model in Settings → Integrations.${geminiMessage ? ' (' + geminiMessage + ')' : ''}`,
          }),
        }
      }
      if (res.status === 401 || res.status === 403) {
        return {
          statusCode: res.status,
          headers: NO_CACHE,
          body: JSON.stringify({
            error: `Gemini API key is invalid or not authorized. Check Settings → Integrations.${geminiMessage ? ' (' + geminiMessage + ')' : ''}`,
          }),
        }
      }
      if (res.status === 404) {
        return {
          statusCode: 404,
          headers: NO_CACHE,
          body: JSON.stringify({
            error: `Model "${model}" not found. Use "Check for newer model" in Settings → Integrations to pick an available model.`,
          }),
        }
      }
      return {
        statusCode: res.status,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Gemini API returned ${res.status}`, details: errText }),
      }
    }

    const raw = await res.json() as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    console.log('[gemini-nutrition] success | model:', model, '| preview:', text.slice(0, 120))

    let nutrition: GeminiNutrition
    try {
      nutrition = JSON.parse(text) as GeminiNutrition
    } catch {
      return {
        statusCode: 502,
        headers: NO_CACHE,
        body: JSON.stringify({ error: 'Failed to parse Gemini response', raw: text }),
      }
    }

    if (nutrition.notFound) {
      return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
    }

    // Heuristic: realistic food servings in ounces are 1–6 oz.
    // A value > 30 labelled "oz" is almost certainly grams (e.g. 113 oz for a 4oz/113g beef serving).
    if (nutrition.servingUnit === 'oz' && typeof nutrition.servingSize === 'number' && nutrition.servingSize > 30) {
      console.log('[gemini-nutrition] heuristic oz→g correction:', nutrition.servingSize, 'oz → g')
      nutrition.servingUnit = 'g'
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
