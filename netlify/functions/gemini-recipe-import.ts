import type { Handler } from '@netlify/functions'

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
- Return ONLY the JSON object, no explanation or markdown.`

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body: RequestBody
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { url, text, apiKey, model } = body

  if (!apiKey || apiKey.trim().length < 20) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A valid Gemini API key is required.' }) }
  }

  if (!url && !text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Provide either a url or text to import.' }) }
  }

  const geminiModel = model?.trim() || 'gemini-flash-latest'

  // If URL provided, fetch page content server-side (avoids browser CORS issues)
  let recipeContent = text?.trim() ?? ''
  let sourceUrl: string | undefined

  if (url?.trim()) {
    sourceUrl = url.trim()
    try {
      const pageRes = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!pageRes.ok) {
        return {
          statusCode: 502,
          body: JSON.stringify({ error: `Could not fetch page (${pageRes.status}). Try pasting the recipe text instead.` }),
        }
      }
      const html = await pageRes.text()
      // Strip HTML tags, collapse whitespace, limit length to avoid Gemini token limits
      recipeContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24000)
    } catch (err) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: `Could not fetch that URL: ${err instanceof Error ? err.message : String(err)}. Try pasting the recipe text instead.`,
        }),
      }
    }
  }

  const userPrompt = sourceUrl
    ? `Extract the recipe from this URL: ${sourceUrl}\n\nPage content:\n${recipeContent}`
    : `Parse this recipe:\n\n${recipeContent}`

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

  let geminiRes: Response
  try {
    geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: `Could not reach Gemini API: ${err instanceof Error ? err.message : String(err)}` }),
    }
  }

  const geminiBody = await geminiRes.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
    error?: { message: string; status?: string }
  }

  if (!geminiRes.ok || geminiBody.error) {
    const msg = geminiBody.error?.message ?? `Gemini error ${geminiRes.status}`
    const isModelNotFound = geminiRes.status === 404 || geminiBody.error?.status === 'NOT_FOUND'
    return {
      statusCode: geminiRes.status,
      body: JSON.stringify({
        error: isModelNotFound
          ? `Model "${geminiModel}" not found. Go to Settings → Integrations and use "Check for newer model" to update.`
          : msg,
      }),
    }
  }

  const rawText = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Gemini returned an empty response.' }) }
  }

  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const recipe = JSON.parse(cleaned)
    if (sourceUrl) recipe.sourceUrl = sourceUrl
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 1, recipe }),
    }
  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not parse the AI response as a recipe. Try again or paste the text manually.' }),
    }
  }
}
