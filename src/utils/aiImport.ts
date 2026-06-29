import type { AIConfig } from '@/types'
import { normalizeUnit } from './recipeCalculations'
import { parseTimeToMinutes } from './units'
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
- suggestedTags should pick from common recipe tags: Chicken, Beef, Pork, Fish, Turkey, Vegetarian, Vegan, Crockpot, Oven, Stovetop, Grill, Instant Pot, Air Fryer, No-Cook, Easy, Quick, Gluten-Free, Dairy-Free, Kid-Friendly, Meal Prep
- Return ONLY the JSON object, no explanation or markdown.`

async function callAI(prompt: string, config: AIConfig): Promise<string> {
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
    const data = await res.json()
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
    const data = await res.json()
    return data.choices[0].message.content

  } else if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
    const data = await res.json()
    return data.candidates[0].content.parts[0].text

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
    const data = await res.json()
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
    ingredients,
    steps: (parsed.steps ?? []).map((s: unknown) => String(s)),
    suggestedTags: (parsed.suggestedTags ?? []).map((t: unknown) => String(t)),
  }
}

// Both functions require an AI provider — the UI gates access before calling these.
export async function importRecipeFromText(text: string, config: AIConfig): Promise<AIRecipeResult> {
  const prompt = `Parse this recipe:\n\n${text}`
  const raw = await callAI(prompt, config)
  return parseAIResponse(raw)
}

export async function importRecipeFromUrl(url: string, config: AIConfig): Promise<AIRecipeResult> {
  const pageText = await fetchPageAsText(url)
  const prompt = `The recipe is from this URL: ${url}\n\nPage content:\n${pageText}`
  const raw = await callAI(prompt, config)
  const result = parseAIResponse(raw)
  result.sourceUrl = url
  return result
}

export function normalizeTimeMinutes(value: number | string | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return Math.max(0, Math.round(value))
  return parseTimeToMinutes(String(value))
}
