import type { Macros } from '@/types'

export type WebLookupConfidence = 'high' | 'medium' | 'low'
export type BarcodeSignal = 'text' | 'image' | 'none'

export interface WebLookupProduct {
  confidence: WebLookupConfidence
  productName: string
  brand: string
  // Only the macro fields Gemini could actually read off the source page —
  // never estimated/calculated, so absent keys mean "not stated," not zero.
  macros: Partial<Macros>
  servingDisplaySize: number | null
  servingDisplayUnit: string | null
  barcodeSignal: BarcodeSignal
  // True only when our own server-side fetch of the source page independently
  // found the literal barcode digits — the deciding factor for "high"
  // confidence, not Gemini's self-reported barcodeSignal.
  confirmedByFetch: boolean
  sourceUrl: string
  sourceTitle: string
}

export interface WebLookupResult {
  status: 'found' | 'not-found' | 'error'
  product?: WebLookupProduct
  errorMessage?: string
}

// Fallback for when Open Food Facts has no record for a barcode — has Gemini
// run a grounded web search instead. Only ever called after the OFF lookup
// (lookupBarcodeProduct in barcodeLookup.ts) already came back not-found;
// this is a distinct, less-trustworthy source and is kept separate from that
// module rather than merged into it.
export async function lookupBarcodeWeb(
  barcode: string,
  nameHint: string,
  brandHint: string,
  apiKey: string,
  model: string
): Promise<WebLookupResult> {
  try {
    const res = await fetch('/api/gemini-barcode-web-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode, nameHint, brandHint, apiKey, model }),
    })
    const json = await res.json() as { status?: number; result?: WebLookupProduct; error?: string }
    if (!res.ok || json.error) {
      return { status: 'error', errorMessage: json.error ?? `Request failed (${res.status})` }
    }
    if (json.status !== 1 || !json.result) {
      return { status: 'not-found' }
    }
    return { status: 'found', product: json.result }
  } catch (err) {
    return { status: 'error', errorMessage: err instanceof Error ? err.message : String(err) }
  }
}
