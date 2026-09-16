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
// Verified 2026-08-08 against OpenAI's own model docs: gpt-4o is currently
// available (active default snapshot, no deprecation notice), not stale.
const OPENAI_MODEL = 'gpt-4o'

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

  // OpenAI keys are less uniform than Anthropic's: legacy plain "sk-" keys
  // (~56 chars total) and newer "sk-proj-"/"sk-svcacct-"/"sk-admin-" keys
  // (up to ~165 chars) all share only the "sk-" prefix — no single
  // fixed-length or fixed-prefix check applies the way Anthropic's
  // "sk-ant-" does. Using a looser floor (prefix + length >= 40) that
  // accommodates the shortest known real format instead of reusing
  // Anthropic's exact threshold unmodified.
  if (!apiKey || !apiKey.trim().startsWith('sk-') || apiKey.trim().length < 40) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'A valid OpenAI API key is required.' }) }
  }

  if (!text?.trim()) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Provide recipe text to import.' }) }
  }

  const key = apiKey.trim()
  const prompt = text.trim()

  console.log(
    '[openai-recipe-import] start | model:', OPENAI_MODEL,
    '| key prefix:', key.slice(0, 8) + '…',
    '| key length:', key.length,
  )

  // ── Call OpenAI ─────────────────────────────────────────────────────────────
  let openaiRes: Response
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })
    console.log('[openai-recipe-import] OpenAI HTTP status:', openaiRes.status)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[openai-recipe-import] OpenAI fetch error:', msg)
    return {
      statusCode: 502,
      headers: NO_CACHE,
      body: JSON.stringify({ error: `Could not reach OpenAI API: ${msg}` }),
    }
  }

  // ── Parse OpenAI response ──────────────────────────────────────────────────
  let openaiBody: { choices?: Array<{ message: { content: string } }>; error?: { message: string; type?: string; code?: string } }
  try {
    openaiBody = await openaiRes.json() as typeof openaiBody
  } catch (err) {
    const errText = `Could not parse OpenAI API response as JSON: ${err instanceof Error ? err.message : String(err)}`
    console.error('[openai-recipe-import]', errText)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: errText }) }
  }

  if (!openaiRes.ok || openaiBody.error) {
    const msg = openaiBody.error?.message ?? `OpenAI error ${openaiRes.status}`
    console.error('[openai-recipe-import] OpenAI API error | status:', openaiRes.status, '| message:', msg)
    if (openaiRes.status === 401) {
      return {
        statusCode: 401,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `OpenAI API key is invalid or not authorized. Check Settings → Integrations. (${msg})` }),
      }
    }
    if (openaiRes.status === 429) {
      return {
        statusCode: 429,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `OpenAI rate limit exceeded. Wait a moment and try again. (${msg})` }),
      }
    }
    if (openaiRes.status === 404) {
      return {
        statusCode: 404,
        headers: NO_CACHE,
        body: JSON.stringify({ error: `Model "${OPENAI_MODEL}" not found or not available for this key. (${msg})` }),
      }
    }
    return { statusCode: openaiRes.status, headers: NO_CACHE, body: JSON.stringify({ error: msg }) }
  }

  const rawText = openaiBody.choices?.[0]?.message?.content ?? ''
  console.log('[openai-recipe-import] raw response length:', rawText.length, '| preview:', rawText.slice(0, 120))

  if (!rawText.trim()) {
    console.error('[openai-recipe-import] OpenAI returned empty text')
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({ error: 'Could not parse the recipe — OpenAI returned an empty response. Please try pasting the recipe text manually instead.' }),
    }
  }

  // Strip markdown code fences (```json ... ``` or ``` ... ```) — response_format
  // json_object should prevent this, but kept for parity with Gemini/Anthropic
  // defense-in-depth.
  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
    console.log('[openai-recipe-import] stripped code fence, cleaned length:', cleaned.length)
  }

  try {
    const recipe = JSON.parse(cleaned) as Record<string, unknown>
    console.log('[openai-recipe-import] success | recipe name:', recipe.name)
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ status: 1, recipe }),
    }
  } catch (parseErr) {
    console.error('[openai-recipe-import] JSON.parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr))
    console.error('[openai-recipe-import] cleaned text that failed to parse (first 500 chars):', cleaned.slice(0, 500))
    return {
      statusCode: 500,
      headers: NO_CACHE,
      body: JSON.stringify({
        error: 'Could not parse the recipe — please try pasting the recipe text manually instead.',
      }),
    }
  }
}
