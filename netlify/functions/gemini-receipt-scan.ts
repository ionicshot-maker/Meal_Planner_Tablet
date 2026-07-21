import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

interface RequestBody {
  image?: string       // base64, no "data:...;base64," prefix
  mimeType?: string
  apiKey?: string
  model?: string
}

const PROMPT = `This is a photo of a grocery store receipt. Extract the store name, the date, the printed total, and every purchased line item, and return ONLY a valid JSON object with this exact shape:

{
  "store": string or null,
  "date": string or null (as printed on the receipt),
  "total": number or null — the final total charged, exactly as printed (look for "TOTAL" or "TOTAL TENDERED", not the subtotal),
  "items": [
    {
      "rawText": string — the item name exactly as printed on the receipt, including any abbreviations,
      "parsedName": string — your best expansion of the raw text into a normal product name. Grocery receipts commonly abbreviate: "DC" = "Diced", "MED" = "Medium", brand names are often truncated (e.g. "MISS." likely means "Mission"). Expand what you recognize, but if you are not confident, just repeat rawText.
      "barcodeText": string or null — many receipts print a numeric product code (UPC/PLU, typically 11-13 digits) directly before or after the item name on the same line. Copy it here exactly as printed, digits only. Do not confuse this with a receipt/transaction/reference number — it should be immediately associated with this specific item's line.
      "quantity": number or null — the count of units purchased, if the receipt states a simple quantity (not for multi-buy or weight-based lines, see below),
      "extendedPrice": number — the total price charged for this line, exactly as printed (this is what the customer paid for the whole line, not necessarily a single unit),
      "unitPriceStated": number or null — a per-unit price for this line, IF explicitly and separately printed (not calculated by you). For weight-based items this is usually a "$X.XX/lb" price.
      "multiBuyText": string or null — if there's a sub-line below the item showing a multi-buy deal or per-unit breakdown (e.g. "2 @2/5.00" or "2 @4.98"), copy that text here EXACTLY as printed. Otherwise null.
      "isWeightBased": boolean — true if this looks like a product sold by weight (produce, meat, deli), often shown with a per-lb price,
      "weightLbs": number or null — the weight in pounds, ONLY if explicitly printed,
      "categoryHint": string or null — a rough grocery category guess for this item (e.g. "Meat & Poultry", "Canned Goods", "Beverages"), or null if unclear
    }
  ]
}

Do NOT do any arithmetic yourself — extract numbers exactly as printed, and leave a field null if it isn't explicitly stated. Skip non-item lines (subtotal, tax, total, card info, loyalty messages) when building the items array. If you cannot read the receipt clearly at all, return a JSON object with confidence: "low" and a reason field instead.

Return ONLY the JSON object, no explanation, no markdown, no code fences.`

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
    '[gemini-receipt-scan] start | model:', primaryModel,
    '| mimeType:', imageMimeType,
    '| image chars:', image.length,
    '| key prefix:', key.slice(0, 8) + '…',
  )

  async function callGemini(m: string): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`
    console.log('[gemini-receipt-scan] calling Gemini | model:', m)
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
    console.log('[gemini-receipt-scan] Gemini HTTP status:', geminiRes.status, '| model:', usedModel)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gemini-receipt-scan] Gemini fetch error:', msg)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }) }
  }

  // Model not found → try fallback
  if (geminiRes.status === 404 && usedModel !== FALLBACK_MODEL) {
    console.log('[gemini-receipt-scan] model not found, trying fallback:', FALLBACK_MODEL)
    usedModel = FALLBACK_MODEL
    try {
      geminiRes = await callGemini(usedModel)
      console.log('[gemini-receipt-scan] fallback Gemini HTTP status:', geminiRes.status)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[gemini-receipt-scan] fallback Gemini fetch error:', msg)
      return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }) }
    }
  }

  let geminiBody: { candidates?: Array<{ content: { parts: Array<{ text: string }> } }>; error?: { message: string; status?: string } }
  try {
    geminiBody = await geminiRes.json() as typeof geminiBody
  } catch (err) {
    const errText = `Could not parse Gemini API response as JSON: ${err instanceof Error ? err.message : String(err)}`
    console.error('[gemini-receipt-scan]', errText)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: errText }) }
  }

  if (!geminiRes.ok || geminiBody.error) {
    const msg = geminiBody.error?.message ?? `Gemini error ${geminiRes.status}`
    console.error('[gemini-receipt-scan] Gemini API error | status:', geminiRes.status, '| message:', msg)
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
  console.log('[gemini-receipt-scan] raw response length:', rawText.length, '| preview:', rawText.slice(0, 120))

  if (!rawText.trim()) {
    console.error('[gemini-receipt-scan] Gemini returned empty text')
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
    console.error('[gemini-receipt-scan] JSON.parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr))
    console.error('[gemini-receipt-scan] cleaned text that failed to parse (first 500 chars):', cleaned.slice(0, 500))
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ lowConfidence: true, reason: 'Could not parse a receipt from this photo — the response was not valid JSON.' }),
    }
  }

  if (parsed.confidence === 'low') {
    console.log('[gemini-receipt-scan] low confidence | reason:', parsed.reason)
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ lowConfidence: true, reason: typeof parsed.reason === 'string' ? parsed.reason : 'The receipt was unclear.' }),
    }
  }

  const items = Array.isArray(parsed.items) ? parsed.items : []
  if (items.length === 0) {
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ lowConfidence: true, reason: 'No line items could be found on this receipt.' }),
    }
  }

  console.log('[gemini-receipt-scan] success | store:', parsed.store, '| items:', items.length, '| model:', usedModel)
  return {
    statusCode: 200,
    headers: NO_CACHE,
    body: JSON.stringify({
      status: 1,
      store: parsed.store ?? null,
      date: parsed.date ?? null,
      total: typeof parsed.total === 'number' ? parsed.total : null,
      items,
    }),
  }
}
