// Single source of truth for the Gemini model defaults used app-wide, on
// both the client and every Netlify Function. Pure — no React/DOM/IndexedDB
// dependencies — so it's safe to import from either runtime.

export const GEMINI_PRIMARY_MODEL = 'gemini-3.1-flash-lite'
export const GEMINI_FALLBACK_MODEL = 'gemini-3-flash'

export interface GeminiModelResolution {
  requestedModel: string
  usedModel: string
  didFallback: boolean
}

export function resolveGeminiModel(requested: string | undefined | null): string {
  return requested?.trim() || GEMINI_PRIMARY_MODEL
}

export function buildGeminiResolution(requestedModel: string, usedModel: string): GeminiModelResolution {
  return { requestedModel, usedModel, didFallback: usedModel !== requestedModel }
}
