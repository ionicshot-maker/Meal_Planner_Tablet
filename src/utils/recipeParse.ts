// Fetches a recipe URL via CORS proxy and returns plain text for the AI prompt.
// Recipe parsing is handled exclusively by AI providers — see aiImport.ts.
export async function fetchPageAsText(url: string): Promise<string> {
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    throw new Error(`Could not fetch that URL (status ${res.status}). Try the "Paste text" tab instead.`)
  }
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)
}
