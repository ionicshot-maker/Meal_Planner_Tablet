import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface RequestBody {
  image?: string       // base64, no "data:...;base64," prefix
  mimeType?: string
  apiKey?: string
  model?: string
}

const PROMPT = `This is a photo of a recipe. Please extract all recipe information and return ONLY a valid JSON object with these exact fields: name (string), servings (number), prepTime (string in format like "30 min" or "1 hr 15 min"), cookTime (string), ingredients (array of objects with quantity string, unit string, name string), steps (array of strings), notes (string or null). If you cannot read the recipe clearly or are not confident about the values return a JSON object with a single field: confidence: "low" and a reason field explaining what was unclear. Do not guess at values you cannot clearly read. Return ONLY the JSON object, no explanation, no markdown, no code fences.`

const FALLBACK_MODEL = 'gemini-2.5-flash'

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

  const { image, mimeType, apiKey, model } = body

  if (!apiKey || apiKey.trim().length < 20) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'A valid Gemini API key is required.' }) }
  }
  if (!image) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'No photo provided.' }) }
  }

  const primaryModel = model?.trim() || 'gemini-2.5-flash'
  const key = apiKey.trim()
  const imageMimeType = mimeType?.trim() || 'image/jpeg'

  console.log(
    '[gemini-photo-recipe] start | model:', primaryModel,
    '| mimeType:', imageMimeType,
    '| image chars:', image.length,
    '| key prefix:', key.slice(0, 8) + '…',
  )

  async function callGemini(m: string): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`
    console.log('[gemini-photo-recipe] calling Gemini | model:', m)
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: imageMimeType, data: image } },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(25000),
    })
  }

  let geminiRes: Response
  let usedModel = primaryModel

  try {
    geminiRes = await callGemini(usedModel)
    console.log('[gemini-photo-recipe] Gemini HTTP status:', geminiRes.status, '| model:', usedModel)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gemini-photo-recipe] Gemini fetch error:', msg)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }) }
  }

  // Model not found → try fallback
  if (geminiRes.status === 404 && usedModel !== FALLBACK_MODEL) {
    console.log('[gemini-photo-recipe] model not found, trying fallback:', FALLBACK_MODEL)
    usedModel = FALLBACK_MODEL
    try {
      geminiRes = await callGemini(usedModel)
      console.log('[gemini-photo-recipe] fallback Gemini HTTP status:', geminiRes.status)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[gemini-photo-recipe] fallback Gemini fetch error:', msg)
      return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }) }
    }
  }

  let geminiBody: { candidates?: Array<{ content: { parts: Array<{ text: string }> } }>; error?: { message: string; status?: string } }
  try {
    geminiBody = await geminiRes.json() as typeof geminiBody
  } catch (err) {
    const errText = `Could not parse Gemini API response as JSON: ${err instanceof Error ? err.message : String(err)}`
    console.error('[gemini-photo-recipe]', errText)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: errText }) }
  }

  if (!geminiRes.ok || geminiBody.error) {
    const msg = geminiBody.error?.message ?? `Gemini error ${geminiRes.status}`
    console.error('[gemini-photo-recipe] Gemini API error | status:', geminiRes.status, '| message:', msg)
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
  console.log('[gemini-photo-recipe] raw response length:', rawText.length, '| preview:', rawText.slice(0, 120))

  if (!rawText.trim()) {
    console.error('[gemini-photo-recipe] Gemini returned empty text')
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ lowConfidence: true, reason: 'Gemini returned an empty response for this photo.' }),
    }
  }

  // Strip markdown code fences
  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch (parseErr) {
    console.error('[gemini-photo-recipe] JSON.parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr))
    console.error('[gemini-photo-recipe] cleaned text that failed to parse (first 500 chars):', cleaned.slice(0, 500))
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ lowConfidence: true, reason: 'Could not parse a recipe from this photo — the response was not valid JSON.' }),
    }
  }

  if (parsed.confidence === 'low') {
    console.log('[gemini-photo-recipe] low confidence | reason:', parsed.reason)
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ lowConfidence: true, reason: typeof parsed.reason === 'string' ? parsed.reason : 'The photo was unclear.' }),
    }
  }

  console.log('[gemini-photo-recipe] success | recipe name:', parsed.name, '| model:', usedModel)
  return {
    statusCode: 200,
    headers: NO_CACHE,
    body: JSON.stringify({ status: 1, recipe: parsed }),
  }
}
