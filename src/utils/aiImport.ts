import type { AIConfig, AppSettings } from '@/types'
import { normalizeUnit } from './recipeCalculations'
import { parseTimeToMinutes } from './units'
import { parseFraction } from './fractionInput'
import { fetchPageAsText } from './recipeParse'

export interface AIRecipeResult {
  name: string
  servings: number
  prepTimeMinutes: number
  cookTimeMinutes: number
  notes?: string
  sourceUrl?: string
  sourceName?: string
  ingredients: AIIngredientLine[]
  steps: string[]
  suggestedTags?: string[]
}

export interface AIIngredientLine {
  name: string
  quantity: number
  unit: string
  servingDisplay?: string
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

// Returns true if the user has any AI provider configured that can do recipe import.
// This includes the main ai config AND a standalone Gemini key.
export function isRecipeImportAvailable(settings: AppSettings): boolean {
  const mainAiReady = settings.ai.provider !== 'none' && settings.ai.apiKey.trim() !== ''
  const geminiReady = Boolean(settings.geminiApiKey?.trim())
  return mainAiReady || geminiReady
}

// Returns the effective AIConfig to use for recipe import.
// Prefers the main ai config; falls back to geminiApiKey if that's all that's configured.
export function effectiveRecipeAI(settings: AppSettings): AIConfig {
  if (settings.ai.provider !== 'none' && settings.ai.apiKey.trim() !== '') {
    return settings.ai
  }
  if (settings.geminiApiKey?.trim()) {
    return { provider: 'gemini', apiKey: settings.geminiApiKey.trim() }
  }
  return settings.ai
}

// Returns a short label describing the active AI for attribution display.
export function recipeAILabel(settings: AppSettings): string {
  if (settings.ai.provider !== 'none' && settings.ai.apiKey.trim() !== '') {
    switch (settings.ai.provider) {
      case 'anthropic': return 'Claude (Anthropic)'
      case 'openai':    return 'OpenAI'
      case 'gemini':    return 'Gemini'
      case 'ollama':    return 'Ollama (local)'
      default: return ''
    }
  }
  if (settings.geminiApiKey?.trim()) return 'Gemini'
  return ''
}

async function callAI(prompt: string, config: AIConfig, geminiModel?: string): Promise<string> {
  const { provider, apiKey, ollamaBaseUrl, ollamaModel } = config

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)
    const data = await res.json() as { content: Array<{ text: string }> }
    return data.content[0].text

  } else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`)
    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0].message.content

  } else if (provider === 'gemini') {
    // Route through Netlify function to avoid CORS/key-exposure issues and get URL-fetch support
    const res = await fetch('/api/gemini-recipe-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, apiKey, model: geminiModel || 'gemini-2.5-flash' }),
    })
    const json = await res.json() as { status?: number; recipe?: unknown; error?: string }
    if (!res.ok || !json.recipe) {
      throw new Error(json.error ?? `Gemini recipe import error: ${res.status}`)
    }
    return JSON.stringify(json.recipe)

  } else if (provider === 'ollama') {
    const base = ollamaBaseUrl ?? 'http://localhost:11434'
    const model = ollamaModel ?? 'llama3'
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        format: 'json',
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`)
    const data = await res.json() as { message: { content: string } }
    return data.message.content
  }

  throw new Error('No AI provider configured.')
}

function parseAIResponse(raw: string): AIRecipeResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = JSON.parse(cleaned)

  const ingredients: AIIngredientLine[] = (parsed.ingredients ?? []).map((i: AIIngredientLine) => ({
    name: String(i.name ?? ''),
    quantity: Number(i.quantity) || 1,
    unit: normalizeUnit(String(i.unit ?? 'each')),
    servingDisplay: i.servingDisplay ?? undefined,
  }))

  return {
    name: String(parsed.name ?? 'Imported Recipe'),
    servings: Math.max(1, Number(parsed.servings) || 4),
    prepTimeMinutes: Number(parsed.prepTimeMinutes) || 0,
    cookTimeMinutes: Number(parsed.cookTimeMinutes) || 0,
    notes: parsed.notes ?? undefined,
    sourceUrl: parsed.sourceUrl ?? undefined,
    ingredients,
    steps: (parsed.steps ?? []).map((s: unknown) => String(s)),
    suggestedTags: (parsed.suggestedTags ?? []).map((t: unknown) => String(t)),
  }
}

export async function importRecipeFromText(text: string, config: AIConfig, geminiModel?: string): Promise<AIRecipeResult> {
  const prompt = `Parse this recipe:\n\n${text}`
  const raw = await callAI(prompt, config, geminiModel)
  return parseAIResponse(raw)
}

// For Gemini, URL fetch happens server-side in the Netlify function.
// For other providers, we fetch the page client-side first.
export async function importRecipeFromUrl(url: string, config: AIConfig, geminiModel?: string): Promise<AIRecipeResult> {
  if (config.provider === 'gemini') {
    const res = await fetch('/api/gemini-recipe-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, apiKey: config.apiKey, model: geminiModel || 'gemini-2.5-flash' }),
    })
    const json = await res.json() as { status?: number; recipe?: unknown; error?: string }
    if (!res.ok || !json.recipe) {
      throw new Error(json.error ?? `Gemini recipe import error: ${res.status}`)
    }
    const result = parseAIResponse(JSON.stringify(json.recipe))
    result.sourceUrl = url
    return result
  }
  // Non-Gemini providers: fetch page client-side and pass text to AI
  const pageText = await fetchPageAsText(url)
  const prompt = `The recipe is from this URL: ${url}\n\nPage content:\n${pageText}`
  const raw = await callAI(prompt, config, geminiModel)
  const result = parseAIResponse(raw)
  result.sourceUrl = url
  return result
}

// ─── Photo import ─────────────────────────────────────────────────────────────
// Photo import always uses Gemini (vision) regardless of the main AI provider setting.

export function effectivePhotoGeminiKey(settings: AppSettings): string {
  if (settings.geminiApiKey?.trim()) return settings.geminiApiKey.trim()
  if (settings.ai.provider === 'gemini' && settings.ai.apiKey.trim()) return settings.ai.apiKey.trim()
  return ''
}

export function isPhotoImportAvailable(settings: AppSettings): boolean {
  return Boolean(effectivePhotoGeminiKey(settings))
}

// Field keys a caller can flag as low-confidence/missing so the editor highlights them in amber
export type UncertainField = 'name' | 'servings' | 'prep' | 'cook' | 'ingredients' | 'steps'

export type PhotoImportOutcome =
  | { lowConfidence: true; reason: string }
  | { lowConfidence: false; result: AIRecipeResult; uncertainFields: UncertainField[] }

interface PhotoRecipeRaw {
  name?: unknown
  servings?: unknown
  prepTime?: unknown
  cookTime?: unknown
  notes?: unknown
  ingredients?: Array<{ quantity?: unknown; unit?: unknown; name?: unknown }>
  steps?: unknown[]
}

// Sends a photo to the Gemini vision recipe parser. Returns a discriminated result
// so the caller can decide whether to open the editor or show a "try again" prompt.
export async function importRecipeFromPhoto(
  base64Image: string,
  mimeType: string,
  geminiApiKey: string,
  geminiModel?: string,
): Promise<PhotoImportOutcome> {
  const res = await fetch('/api/gemini-photo-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image, mimeType, apiKey: geminiApiKey, model: geminiModel || 'gemini-2.5-flash' }),
  })
  const json = await res.json() as { status?: number; recipe?: PhotoRecipeRaw; lowConfidence?: boolean; reason?: string; error?: string }

  if (json.lowConfidence) {
    return { lowConfidence: true, reason: json.reason ?? 'The photo was unclear.' }
  }
  if (!res.ok || !json.recipe) {
    throw new Error(json.error ?? `Photo import failed (${res.status})`)
  }

  const raw = json.recipe
  const uncertainFields: UncertainField[] = []

  if (!String(raw.name ?? '').trim()) uncertainFields.push('name')
  if (!raw.servings) uncertainFields.push('servings')
  if (!raw.prepTime) uncertainFields.push('prep')
  if (!raw.cookTime) uncertainFields.push('cook')
  if (!raw.ingredients?.length) uncertainFields.push('ingredients')
  if (!raw.steps?.length) uncertainFields.push('steps')

  const ingredients: AIIngredientLine[] = (raw.ingredients ?? []).map(i => ({
    name: String(i?.name ?? ''),
    quantity: parseFraction(String(i?.quantity ?? '')) ?? 1,
    unit: normalizeUnit(String(i?.unit ?? 'each')),
  }))

  const result: AIRecipeResult = {
    name: String(raw.name ?? 'Imported Recipe'),
    servings: Math.max(1, Number(raw.servings) || 4),
    prepTimeMinutes: raw.prepTime ? parseTimeToMinutes(String(raw.prepTime)) : 0,
    cookTimeMinutes: raw.cookTime ? parseTimeToMinutes(String(raw.cookTime)) : 0,
    notes: raw.notes ? String(raw.notes) : undefined,
    ingredients,
    steps: (raw.steps ?? []).map(s => String(s)),
  }

  return { lowConfidence: false, result, uncertainFields }
}

export function normalizeTimeMinutes(value: number | string | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return Math.max(0, Math.round(value))
  return parseTimeToMinutes(String(value))
}
