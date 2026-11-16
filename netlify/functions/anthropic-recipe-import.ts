import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface RequestBody {
  text?: string
  apiKey?: string
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
- unit must be one of: cup, tbsp, tsp, oz, lb, g, kg, ml, l, can, package, bag, box, piece, slice, jar, each, floz
- servingDisplay is an optional short description like "6 oz" or "1 cup"
- suggestedTags should pick from common recipe tags: Chicken, Beef, Pork, Fish, Turkey, Vegetarian, Vegan, Crockpot, Oven, Stovetop, Grill, Instant Pot, Air Fryer, No-Cook, Easy, Quick, Gluten-Free, Dairy-Free, Kid-Friendly, Meal Prep, Beverages, Homemade, Dessert, Snack, Soup, Salad
- Return ONLY the JSON object, no explanation or markdown.`

// Faithful relocation of the model string already hardcoded client-side
// (src/utils/aiImport.ts) — kept as-is, not upgraded, per explicit decision.
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

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

  const { text, apiKey } = body

  // Anthropic keys are self-describing (sk-ant-api03-<~95 char body>, ~108
  // chars total) — a prefix + minimum-length check, not a bare length
  // threshold like Gemini's, since Gemini keys carry no such prefix.
  if (!apiKey || !apiKey.trim().startsWith('sk-ant-') || apiKey.trim().length < 40) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'A valid Anthropic API key is required.' }) }
  }

  if (!text?.trim()) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Provide recipe text to import.' }) }
  }

  const key = apiKey.trim()
  const prompt = text.trim()

  console.log(
    '[anthropic-recipe-import] start | model:', ANTHROPIC_MODEL,
    '| key prefix:', key.slice(0, 11) + '…',
    '| key length:', key.length,
  )

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })
    console.log('[anthropic-recipe-import] Anthropic HTTP status:', anthropicRes.status)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[anthropic-recipe-import] Anthropic fetch error:', msg)
    return {
      statusCode: 502,
      headers: NO_CACHE,
      body: JSON.stringify({ error: `Could not reach Anthropic API: ${msg}` }),
    }
  }

  // ── Parse Anthropic response ───────────────────────────────────────────────
  let anthropicBody: { content?: Array<{ text: string }>; error?: { message: string; type?: string } }
  try {
    anthropicBody = await anthropicRes.json() as typeof anthropicBody
  } catch (err) {
    const errText = `Could not parse Anthropic API response as JSON: ${err instanceof Error ? err.message : String(err)}`
    console.error('[anthropic-recipe-import]', errText)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: errText }) }
  }

  if (!anthropicRes.ok || anthropicBody.error) {
    const msg = anthropicBody.error?.message ?? `Anthropic error ${anthropicRes.status}`
    console.error('[anthropic-recipe-import] Anthropic API error | status:', anthropicRes.status, '| message:', msg)
    if (anthropicRes.status === 401) {
      return {
        statusCode: 401,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Anthropic API key is invalid or not authorized. Check Settings → Integrations. (${msg})` }),
      }
    }
    if (anthropicRes.status === 429) {
      return {
        statusCode: 429,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Anthropic rate limit exceeded. Wait a moment and try again. (${msg})` }),
      }
    }
    if (anthropicRes.status === 404) {
      return {
        statusCode: 404,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Model "${ANTHROPIC_MODEL}" not found or not available for this key. (${msg})` }),
      }
    }
    return { statusCode: anthropicRes.status, headers: NO_CACHE, body: JSON.stringify({ error: msg }) }
  }

  const rawText = anthropicBody.content?.[0]?.text ?? ''
  console.log('[anthropic-recipe-import] raw response length:', rawText.length, '| preview:', rawText.slice(0, 120))

  if (!rawText.trim()) {
    console.error('[anthropic-recipe-import] Anthropic returned empty text')
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({ error: 'Could not parse the recipe — Anthropic returned an empty response. Please try pasting the recipe text manually instead.' }),
    }
  }

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
    console.log('[anthropic-recipe-import] stripped code fence, cleaned length:', cleaned.length)
  }

  try {
    const recipe = JSON.parse(cleaned) as Record<string, unknown>
    console.log('[anthropic-recipe-import] success | recipe name:', recipe.name)
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ status: 1, recipe }),
    }
  } catch (parseErr) {
    console.error('[anthropic-recipe-import] JSON.parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr))
    console.error('[anthropic-recipe-import] cleaned text that failed to parse (first 500 chars):', cleaned.slice(0, 500))
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({
        error: 'Could not parse the recipe — please try pasting the recipe text manually instead.',
      }),
    }
  }
}
