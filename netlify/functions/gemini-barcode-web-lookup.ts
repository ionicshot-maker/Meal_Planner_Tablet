import type { Handler } from '@netlify/functions'

const NO_CACHE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const FALLBACK_MODEL = 'gemini-3-flash'

interface RequestBody {
  barcode?: string
  nameHint?: string
  brandHint?: string
  apiKey?: string
  model?: string
}

interface NutritionClaim {
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fiber?: number | null
  sugar?: number | null
  fat?: number | null
  sodium?: number | null
}

interface GeminiClaim {
  found?: boolean
  product_name?: string | null
  brand?: string | null
  serving_display_size?: number | null
  serving_display_unit?: string | null
  nutrition?: NutritionClaim | null
  barcode_signal?: 'text' | 'image' | 'none'
}

interface GroundingChunk {
  web?: { uri?: string; title?: string }
}

function buildPrompt(barcode: string, nameHint: string, brandHint: string): string {
  return `You are looking up a specific grocery product using a barcode number and a product name/brand guess extracted from a store receipt. Use web search to find the SPECIFIC product matching this exact barcode — not just a similar product.

Barcode: ${barcode}
Receipt line's item text / best-guess name: ${nameHint}
${brandHint ? `Possible brand: ${brandHint}` : ''}

Search first using the barcode number itself (many UPC/product-lookup databases and retailer sites index by barcode). If that doesn't turn up a clear match, search using the brand + product name.

For whichever single best-matching product page you find, extract:
- product_name: the full product name as shown on the source
- brand: the brand/manufacturer
- serving_display_size / serving_display_unit: the stated serving size (e.g. 1 and "cup"), if shown
- nutrition: calories, protein (g), carbs (g), fiber (g), sugar (g), fat (g), sodium (mg) — PER SERVING. Only include a field if the exact number is explicitly stated on the source page. Do NOT estimate, calculate, round from a different serving size, or fill in a typical/expected value — leave any field you're not directly reading off the page as null.
- barcode_signal: how the barcode appears on the source page —
  - "text": the exact digits ${barcode} (or an equivalent UPC-A/EAN-13 form of them) appear as literal, readable text on the page (e.g. "UPC: 012345678905"). Only use this if you can literally quote the digits from the page's text content — not if you are inferring them from a barcode graphic/image.
  - "image": a barcode graphic/image is shown on the page, but the digits are not separately given as text.
  - "none": no barcode is shown or mentioned on the page at all.

Be conservative — if you are not confident you found the correct SPECIFIC product (matching this exact barcode, not just a similar item, a different size, or a different flavor), set found to false rather than guessing.

Return ONLY a JSON object with this exact shape, no markdown, no explanation:
{
  "found": boolean,
  "product_name": string or null,
  "brand": string or null,
  "serving_display_size": number or null,
  "serving_display_unit": string or null,
  "nutrition": {
    "calories": number or null,
    "protein": number or null,
    "carbs": number or null,
    "fiber": number or null,
    "sugar": number or null,
    "fat": number or null,
    "sodium": number or null
  },
  "barcode_signal": "text" or "image" or "none"
}`
}

// Same UPC-A/EAN-13 leading-zero equivalence used elsewhere in the app for
// comparing a scanned barcode against however a source happens to print it.
function digitVariants(barcode: string): string[] {
  const digits = barcode.replace(/\D/g, '')
  const variants = new Set([digits])
  if (digits.length === 13 && digits.startsWith('0')) variants.add(digits.slice(1))
  if (digits.length === 12) variants.add('0' + digits)
  return [...variants]
}

// Independent re-verification of Gemini's own "I found the barcode as text"
// claim — fetches the actual page ourselves and checks whether the digit
// string is really there, rather than trusting the model's self-report. This
// is the only check in this feature that doesn't ultimately rely on Gemini
// being honest about what it saw.
async function pageContainsBarcode(url: string, barcode: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AngeloFamilyMealPlanner/1.0 (ionicshot@gmail.com)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const text = (await res.text()).slice(0, 2_000_000)
    // Strip everything but digits so a formatted barcode on the page (e.g.
    // "0-12345-67890-5" or with spaces) still matches as one contiguous run.
    const digitsOnly = text.replace(/[^\d]/g, '')
    return digitVariants(barcode).some(v => digitsOnly.includes(v))
  } catch {
    return false
  }
}

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

  const { barcode, nameHint, brandHint, apiKey, model } = body

  if (!apiKey || apiKey.trim().length < 20) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'A valid Gemini API key is required.' }) }
  }
  if (!barcode?.trim()) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'No barcode provided.' }) }
  }

  const primaryModel = model?.trim() || 'gemini-3.1-flash-lite'
  const key = apiKey.trim()

  async function callGemini(m: string): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(barcode.trim(), nameHint?.trim() || '(unknown)', brandHint?.trim() || '') }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(28000),
    })
  }

  let geminiRes: Response
  let usedModel = primaryModel
  try {
    geminiRes = await callGemini(usedModel)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }) }
  }

  if (geminiRes.status === 404 && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL
    try {
      geminiRes = await callGemini(usedModel)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not reach Gemini API: ${msg}` }) }
    }
  }

  let geminiBody: {
    candidates?: Array<{
      content: { parts: Array<{ text: string }> }
      groundingMetadata?: { groundingChunks?: GroundingChunk[] }
    }>
    error?: { message: string; status?: string }
  }
  try {
    geminiBody = await geminiRes.json() as typeof geminiBody
  } catch (err) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: `Could not parse Gemini response: ${err instanceof Error ? err.message : String(err)}` }) }
  }

  if (!geminiRes.ok || geminiBody.error) {
    const msg = geminiBody.error?.message ?? `Gemini error ${geminiRes.status}`
    if (geminiRes.status === 429) {
      return { statusCode: 429, headers: NO_CACHE, body: JSON.stringify({ error: `Gemini rate limit exceeded. Wait a moment and try again. (${msg})` }) }
    }
    if (geminiRes.status === 401 || geminiRes.status === 403) {
      return { statusCode: geminiRes.status, headers: NO_CACHE, body: JSON.stringify({ error: `Gemini API key is invalid or not authorized. (${msg})` }) }
    }
    return { statusCode: geminiRes.status, headers: NO_CACHE, body: JSON.stringify({ error: msg }) }
  }

  const candidate = geminiBody.candidates?.[0]
  const rawText = candidate?.content?.parts?.[0]?.text ?? ''

  // The list of pages Gemini's search tool actually retrieved, straight from
  // Google's grounding infrastructure — not anything the model typed itself.
  // No real grounding chunks means nothing here is verifiable, so we don't
  // trust any claim in the JSON text below, regardless of how it reads.
  const groundingChunks = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((c): c is GroundingChunk & { web: { uri: string } } => !!c.web?.uri)

  if (!rawText.trim() || groundingChunks.length === 0) {
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
  }

  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  let claim: GeminiClaim
  try {
    claim = JSON.parse(cleaned) as GeminiClaim
  } catch {
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
  }

  if (!claim.found || !claim.product_name) {
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
  }

  const nutrition = claim.nutrition ?? {}
  const macros: Record<string, number> = {}
  for (const [k, v] of Object.entries(nutrition)) {
    if (typeof v === 'number' && isFinite(v)) macros[k] = v
  }
  // The whole point of this fallback is nutrition — a barcode/name match with
  // no usable macro data isn't worth surfacing as a "found" suggestion here.
  if (Object.keys(macros).length === 0) {
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 0 }) }
  }

  // Independently re-check up to 3 of the real grounding sources for the
  // literal barcode digits, in parallel — this is the deciding factor for
  // "high" confidence, not Gemini's own barcode_signal claim.
  const candidateChunks = groundingChunks.slice(0, 3)
  const confirmations = await Promise.all(
    candidateChunks.map(c => pageContainsBarcode(c.web.uri, barcode.trim()))
  )
  const confirmedIdx = confirmations.findIndex(Boolean)
  const confirmedByFetch = confirmedIdx !== -1
  const chosenChunk = confirmedByFetch ? candidateChunks[confirmedIdx] : groundingChunks[0]

  const barcodeSignal = claim.barcode_signal === 'text' || claim.barcode_signal === 'image' ? claim.barcode_signal : 'none'
  const confidence: 'high' | 'medium' | 'low' =
    confirmedByFetch ? 'high' :
    barcodeSignal !== 'none' ? 'medium' :
    'low'

  const result = {
    confidence,
    productName: claim.product_name,
    brand: claim.brand || '',
    macros,
    servingDisplaySize: typeof claim.serving_display_size === 'number' ? claim.serving_display_size : null,
    servingDisplayUnit: claim.serving_display_unit || null,
    barcodeSignal,
    confirmedByFetch,
    sourceUrl: chosenChunk.web.uri,
    sourceTitle: chosenChunk.web.title || chosenChunk.web.uri,
  }

  return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ status: 1, result }) }
}
