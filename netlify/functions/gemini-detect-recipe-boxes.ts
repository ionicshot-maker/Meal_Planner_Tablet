import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface RequestBody {
  image?: string       // base64, no "data:...;base64," prefix
  mimeType?: string
  apiKey?: string
  model?: string
}

const PROMPT = `This is a photo of one or more pages that may contain multiple distinct recipes (for example, a cookbook spread with several recipes on it). Identify the bounding box of every individual recipe visible in the photo — from its title through the end of its ingredients and instructions, excluding neighboring recipes, page headers/footers, and decorative elements.

For each recipe found, return its bounding box as percentages of the full photo's width and height, on a 0-100 scale (not 0-1, not 0-1000), measured from the top-left corner of the photo. Return ONLY a valid JSON object with this exact shape:
{"boxes": [{"leftPct": number, "topPct": number, "widthPct": number, "heightPct": number}, ...]}

Order the boxes in natural reading order (top to bottom, left to right). If the photo contains only one recipe, or you cannot confidently identify separate recipe boundaries, return {"boxes": []}. Do not include any explanation, markdown, or code fences — return only the JSON object.`

const FALLBACK_MODEL = 'gemini-3-flash'

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

  const primaryModel = model?.trim() || 'gemini-3.1-flash-lite'
  const key = apiKey.trim()
  const imageMimeType = mimeType?.trim() || 'image/jpeg'

  console.log(
    '[gemini-detect-recipe-boxes] start | model:', primaryModel,
    '| mimeType:', imageMimeType,
    '| image chars:', image.length,
  )

  async function callGemini(m: string): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`
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
  } catch (err) {
    console.error('[gemini-detect-recipe-boxes] Gemini fetch error:', err instanceof Error ? err.message : String(err))
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes: [] }) }
  }

  if (geminiRes.status === 404 && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL
    try {
      geminiRes = await callGemini(usedModel)
    } catch (err) {
      console.error('[gemini-detect-recipe-boxes] fallback Gemini fetch error:', err instanceof Error ? err.message : String(err))
      return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes: [] }) }
    }
  }

  // This detection is a best-effort suggestion feature, not a required step in the
  // import pipeline — any failure past this point degrades to an empty box list
  // (200 + { boxes: [] }) rather than surfacing an error, so the caller's existing
  // "no preset crop" fallback is the only behavior the user ever sees.
  let geminiBody: { candidates?: Array<{ content: { parts: Array<{ text: string }> } }>; error?: { message: string; status?: string } }
  try {
    geminiBody = await geminiRes.json() as typeof geminiBody
  } catch (err) {
    console.error('[gemini-detect-recipe-boxes] could not parse Gemini response as JSON:', err instanceof Error ? err.message : String(err))
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes: [] }) }
  }

  if (!geminiRes.ok || geminiBody.error) {
    console.error('[gemini-detect-recipe-boxes] Gemini API error | status:', geminiRes.status, '| message:', geminiBody.error?.message)
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes: [] }) }
  }

  const rawText = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!rawText.trim()) {
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes: [] }) }
  }

  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  let parsed: { boxes?: unknown }
  try {
    parsed = JSON.parse(cleaned) as { boxes?: unknown }
  } catch (parseErr) {
    console.error('[gemini-detect-recipe-boxes] JSON.parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr))
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes: [] }) }
  }

  const rawBoxes = Array.isArray(parsed.boxes) ? parsed.boxes : []
  const boxes = rawBoxes
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
    .map(b => ({
      leftPct: Number(b.leftPct),
      topPct: Number(b.topPct),
      widthPct: Number(b.widthPct),
      heightPct: Number(b.heightPct),
    }))
    .filter(b => [b.leftPct, b.topPct, b.widthPct, b.heightPct].every(n => Number.isFinite(n)))

  console.log('[gemini-detect-recipe-boxes] success | boxes found:', boxes.length, '| model:', usedModel)
  return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ boxes }) }
}
