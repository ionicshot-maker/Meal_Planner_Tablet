import type { AppSettings } from '@/types'
import type { GeminiModelResolution } from './geminiModel'

// Client-only: persists the outcome of the most recent Gemini-backed call.
// updateSettings() is a React Context concern with no server equivalent, so
// this stays out of the shared, server-safe geminiModel.ts. Always overwrites
// — no historical log is kept, only the most recent call's outcome matters.
export async function recordGeminiCallResult(
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>,
  resolution: GeminiModelResolution
): Promise<void> {
  await updateSettings({ lastGeminiResolution: resolution })
}
