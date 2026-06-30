// Fetches JSON through a CORS/SSL proxy with a fallback.
// Needed on networks with a corporate SSL-inspecting proxy.
export async function proxyFetchJson(url: string): Promise<unknown> {
  console.log('[proxyFetch] Requesting URL:', url)

  // ── Attempt 1: corsproxy.io ────────────────────────────────────────────────
  const proxy1 = `https://corsproxy.io/?${url}`
  console.log('[proxyFetch] Attempt 1 — corsproxy.io:', proxy1)
  try {
    const res1 = await fetch(proxy1)
    console.log('[proxyFetch] corsproxy.io HTTP status:', res1.status, res1.statusText, '| ok:', res1.ok)

    const text1 = await res1.text()
    console.log('[proxyFetch] corsproxy.io raw response (first 500 chars):', text1.slice(0, 500))

    if (res1.ok) {
      try {
        const data = JSON.parse(text1)
        console.log('[proxyFetch] corsproxy.io JSON parsed OK. Returning result.')
        return data
      } catch (parseErr) {
        console.warn('[proxyFetch] corsproxy.io JSON parse failed:', parseErr)
        // fall through to allorigins
      }
    } else {
      console.warn('[proxyFetch] corsproxy.io returned non-OK status, falling through to allorigins.')
    }
  } catch (err1) {
    console.warn('[proxyFetch] corsproxy.io fetch threw:', err1)
    // fall through to allorigins
  }

  // ── Attempt 2: allorigins ──────────────────────────────────────────────────
  const proxy2 = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
  console.log('[proxyFetch] Attempt 2 — allorigins:', proxy2)
  try {
    const res2 = await fetch(proxy2)
    console.log('[proxyFetch] allorigins HTTP status:', res2.status, res2.statusText, '| ok:', res2.ok)

    if (!res2.ok) throw new Error(`allorigins non-OK: ${res2.status} ${res2.statusText}`)

    const text2 = await res2.text()
    console.log('[proxyFetch] allorigins raw response (first 500 chars):', text2.slice(0, 500))

    const wrapper = JSON.parse(text2) as { contents: string | null }
    console.log('[proxyFetch] allorigins wrapper.contents (first 200 chars):', String(wrapper.contents).slice(0, 200))

    if (!wrapper.contents) throw new Error('allorigins returned null/empty contents')

    const data = JSON.parse(wrapper.contents)
    console.log('[proxyFetch] allorigins JSON parsed OK. Returning result.')
    return data
  } catch (err2) {
    console.error('[proxyFetch] allorigins failed:', err2)
    throw new Error(`Network request failed — both proxies failed. Last error: ${err2}`)
  }
}
