// Shared source for the Gemini nutrition-label OCR pipeline — used by both
// the Scan Label import tab and the Receipt Scanner's barcode-not-found
// fallback, so the two never drift into different extraction behavior.

import type { GeminiModelResolution } from './geminiModel'

export interface LabelNutrition {
  productName?: string | null
  brand?: string | null
  servingSize?: number | null
  servingUnit?: string | null
  servingsPerContainer?: number | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fiber?: number | null
  sugar?: number | null
  fat?: number | null
  saturatedFat?: number | null
  transFat?: number | null
  sodium?: number | null
}

export interface LabelScanResult {
  status: 'found' | 'low-confidence' | 'error'
  nutrition?: LabelNutrition
  reason?: string
  // True only when `reason` is Gemini's own reported text (parsed.reason from
  // a genuine confidence:"low" response); false for every app-authored
  // fallback string (empty response, unparseable JSON, or a low-confidence
  // response with no reason field) — lets the UI distinguish an actual
  // Gemini quotation from our own wording without changing what triggers
  // each case or what reason text it produces.
  reasonIsFromGemini?: boolean
  errorMessage?: string
  resolution?: GeminiModelResolution
}

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fiber', 'sugar', 'fat', 'sodium'] as const

// Fields the OCR pass couldn't confidently read — surfaced so the review UI
// can highlight exactly those instead of asking for a blanket re-check of
// everything.
export function uncertainLabelFields(nutrition: LabelNutrition): Set<string> {
  const uncertain = new Set<string>()
  if (!nutrition.productName) uncertain.add('name')
  if (nutrition.servingSize == null) uncertain.add('servingSize')
  for (const key of MACRO_KEYS) {
    if (nutrition[key] == null) uncertain.add(key)
  }
  return uncertain
}

export async function scanNutritionLabel(dataUrl: string, apiKey: string, model: string): Promise<LabelScanResult> {
  try {
    const commaIdx = dataUrl.indexOf(',')
    const base64 = dataUrl.slice(commaIdx + 1)
    const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:(.*);base64/)
    const mimeType = mimeMatch?.[1] || 'image/jpeg'

    const res = await fetch('/api/gemini-label-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType, apiKey, model }),
    })
    const json = await res.json() as {
      status?: number; nutrition?: LabelNutrition; lowConfidence?: boolean; reason?: string; reasonIsFromGemini?: boolean; error?: string
      resolution?: GeminiModelResolution
    }

    if (!res.ok || json.error) {
      return { status: 'error', errorMessage: json.error ?? `Request failed (${res.status})` }
    }
    if (json.lowConfidence || !json.nutrition) {
      return { status: 'low-confidence', reason: json.reason ?? 'The label was unclear.', reasonIsFromGemini: json.reasonIsFromGemini ?? false }
    }
    return { status: 'found', nutrition: json.nutrition, resolution: json.resolution }
  } catch (err) {
    return { status: 'error', errorMessage: err instanceof Error ? err.message : String(err) }
  }
}
