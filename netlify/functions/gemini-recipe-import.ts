import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface RequestBody {
  url?: string
  text?: string
  apiKey?: string
  model?: string
}

const RECIPE_JSON_SCHEMA = `{
  "name": "string",
  "servings": number,
  "prepTimeMinutes": number,
  "cookTimeMinutes": number,
  "notes": "string or null",
  "ingredients": [{"name":"string","quantity":number,"unit":"string","servingDisplay":"string or null"}],
  "steps": ["string"],
  "suggestedTags": ["string"]
}`

const SYSTEM_PROMPT = `You are a recipe parser. Extract recipe information and return ONLY valid JSON matching this schema:
${RECIPE_JSON_SCHEMA}
Rules:
- quantity must be a number (use 0.5 for ½, 0.25 for ¼, etc.)
- unit must be one of: cup, tbsp, tsp, oz, lb, g, kg, ml, l, floz, can, package, bag, box, piece, slice, jar, each
- servingDisplay is an optional short string like "6 oz" or "1 cup"
- suggestedTags must be chosen from: Chicken, Beef, Pork, Fish, Shrimp, Turkey, Vegetarian, Vegan, Crockpot, Oven, Stovetop, Grill, Instant Pot, Air Fryer, No-Cook, Easy, Quick, Gluten-Free, Dairy-Free, Kid-Friendly, Meal Prep, Beverages, Homemade, Dessert, Snack, Soup, Salad, Sandwich
- Return ONLY the JSON object, no explanation, no markdown, no code fences.`

const FALLBACK_MODEL = 'gemini-2.5-flash-lite'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: NO_CACHE, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body: RequestBody
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody
  } catch {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { url, text, apiKey, model } = body

  if (!apiKey || apiKey.trim().length < 20) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'A valid Gemini API key is required.' }) }
  }

  if (!url && !text) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Provide either a url or text to import.' }) }
  }

  const primaryModel = model?.trim() || 'gemini-2.5-flash'
  const key = apiKey.trim()

  console.log(
    '[gemini-recipe-import] start | source:', url ? 'url' : 'text',
    '| model:', primaryModel,
    '| key prefix:', key.slice(0, 8) + '…',
    '| key length:', key.length,
  )

  // ── Fetch page content if URL provided ────────────────────────────────────
  let recipeContent = text?.trim() ?? ''
  let sourceUrl: string | undefined

  if (url?.trim()) {
    sourceUrl = url.trim()
    console.log('[gemini-recipe-import] fetching URL:', sourceUrl)
    try {
      const pageRes = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(8000),
      })
      console.log('[gemini-recipe-import] page fetch status:', pageRes.status)
      if (!pageRes.ok) {
        return {
          statusCode: 502,
          headers: NO_CACHE,
          body: JSON.stringify({ error: `Could not fetch that page (HTTP ${pageRes.status}). Try pasting the recipe text instead.` }),
        }
      }
      const html = await pageRes.text()
      recipeContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24000)
      console.log('[gemini-recipe-import] page content chars after stripping:', recipeContent.length)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[gemini-recipe-import] page fetch error:', msg)
      return {
        statusCode: 502,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Could not fetch that URL: ${msg}. Try pasting the recipe text instead.` }),
      }
    }
  }

  const userPrompt = sourceUrl
    ? `Extract the recipe from this URL: ${sourceUrl}\n\nPage content:\n${recipeContent}`
    : `Parse this recipe:\n\n${recipeContent}`

  // ── Call Gemini (with model fallback) ─────────────────────────────────────
  async function callGemini(m: string): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`
    console.log('[gemini-recipe-import] calling Gemini | model:', m, '| url:', url)
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(20000),
    })
  }

  let geminiRes: Response
  let usedModel = primaryModel

  try {
    geminiRes = await callGemini(usedModel)
    console.log('[gemini-recipe-import] Gemini HTTP status:', geminiRes.status, '| model:', usedModel)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gemini-recipe-import] Gemini fetch error:', msg)
    return {
      statusCode: 502,
      headers: NO_CACHE,
      body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }),
    }
  }

  // Model not found → try fallback
  if (geminiRes.status === 404 && usedModel !== FALLBACK_MODEL) {
    console.log('[gemini-recipe-import] model not found, trying fallback:', FALLBACK_MODEL)
    usedModel = FALLBACK_MODEL
    try {
      geminiRes = await callGemini(usedModel)
      console.log('[gemini-recipe-import] fallback Gemini HTTP status:', geminiRes.status)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[gemini-recipe-import] fallback Gemini fetch error:', msg)
      return {
        statusCode: 502,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }),
      }
    }
  }

  // ── Parse Gemini response ─────────────────────────────────────────────────
  let geminiBody: { candidates?: Array<{ content: { parts: Array<{ text: string }> } }>; error?: { message: string; status?: string } }
  try {
    geminiBody = await geminiRes.json() as typeof geminiBody
  } catch (err) {
    const errText = `Could not parse Gemini API response as JSON: ${err instanceof Error ? err.message : String(err)}`
    console.error('[gemini-recipe-import]', errText)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: errText }) }
  }

  if (!geminiRes.ok || geminiBody.error) {
    const msg = geminiBody.error?.message ?? `Gemini error ${geminiRes.status}`
    console.error('[gemini-recipe-import] Gemini API error | status:', geminiRes.status, '| message:', msg)
    if (geminiRes.status === 404 || geminiBody.error?.status === 'NOT_FOUND') {
      return {
        statusCode: 404,
        headers: NO_CACHE,
        body: JSON.stringify({
          error: `Model "${usedModel}" not found. Go to Settings → Integrations and use "Check for newer model" to update.`,
        }),
      }
    }
    if (geminiRes.status === 429) {
      return {
        statusCode: 429,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Gemini rate limit exceeded. Wait a moment and try again. (${msg})` }),
      }
    }
    if (geminiRes.status === 401 || geminiRes.status === 403) {
      return {
        statusCode: geminiRes.status,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Gemini API key is invalid or not authorized. Check Settings → Integrations. (${msg})` }),
      }
    }
    return { statusCode: geminiRes.status, headers: NO_CACHE, body: JSON.stringify({ error: msg }) }
  }

  const rawText = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  console.log('[gemini-recipe-import] raw response length:', rawText.length, '| preview:', rawText.slice(0, 120))

  if (!rawText.trim()) {
    console.error('[gemini-recipe-import] Gemini returned empty text')
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({ error: 'Could not parse the recipe — Gemini returned an empty response. Please try pasting the recipe text manually instead.' }),
    }
  }

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
    console.log('[gemini-recipe-import] stripped code fence, cleaned length:', cleaned.length)
  }

  try {
    const recipe = JSON.parse(cleaned) as Record<string, unknown>
    if (sourceUrl) recipe.sourceUrl = sourceUrl
    console.log('[gemini-recipe-import] success | recipe name:', recipe.name, '| model:', usedModel)
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ status: 1, recipe }),
    }
  } catch (parseErr) {
    console.error('[gemini-recipe-import] JSON.parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr))
    console.error('[gemini-recipe-import] cleaned text that failed to parse (first 500 chars):', cleaned.slice(0, 500))
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({
        error: 'Could not parse the recipe — please try pasting the recipe text manually instead.',
      }),
    }
  }
}
