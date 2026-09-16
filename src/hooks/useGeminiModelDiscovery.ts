import { useState } from 'react'

export interface FetchedGeminiModel {
  id: string
  displayName: string
}

// Fetches Google's live Gemini model list, filtered to only
// generateContent-capable models. Kept as its own hook (not local component
// state) so both the curated chip picker and a future browse-all view can
// read the same discovered list without each re-fetching/re-filtering it.
export function useGeminiModelDiscovery() {
  const [models, setModels] = useState<FetchedGeminiModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function fetchModels(apiKey: string) {
    if (!apiKey) return
    setLoading(true)
    setError('')
    setModels([])
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      )
      if (!res.ok) {
        const text = await res.text()
        setError(`API returned ${res.status} — check your API key.`)
        console.error('[useGeminiModelDiscovery] model list error:', text)
        return
      }
      const json = await res.json() as {
        models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>
      }
      const generationModels = (json.models ?? [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => ({
          id: m.name.replace('models/', ''),
          displayName: m.displayName ?? m.name.replace('models/', ''),
        }))
      if (generationModels.length === 0) {
        setError('No generateContent models found for this key.')
        return
      }
      setModels(generationModels)
    } catch (e) {
      setError(`Could not reach Gemini API: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return { models, loading, error, fetchModels }
}
