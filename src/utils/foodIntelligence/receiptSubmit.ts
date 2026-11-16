/**
 * Optional: after Meal Planner saves a scanned receipt, tell Food Intelligence what the store charged so its price
 * history and basket comparisons improve for everyone in the household.  Fire-and-forget: Meal Planner's own save
 * has already succeeded and never waits on, or fails because of, this call.
 */
import { guarded } from './resilient.ts'
import type { GuardDeps } from './resilient.ts'

export interface ReceiptLineInput {
  name: string
  /** UPC/EAN if Meal Planner matched or read one. */
  barcode?: string | null
  /** Price per unit (what Meal Planner stores as `unitPrice`). */
  unitPrice: number
  quantity?: number | null
}

export interface ReceiptInput {
  /** Store name as printed on the receipt, e.g. "Walmart Supercenter". */
  storeName: string | null
  /** ISO date of purchase (optional). */
  date?: string | null
  lines: ReceiptLineInput[]
}

export interface ReceiptSubmitResult {
  storeId: string
  matched: number
  unmatched: number
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Pick the known store whose name/retailer best matches the receipt header; `null` when nothing matches. */
export function matchStore<T extends { id: string; name: string; retailer: string | null }>(stores: T[], receiptStore: string | null): T | null {
  if (!receiptStore) return null
  const target = norm(receiptStore)
  if (!target) return null
  const scored = stores
    .map(s => {
      const names = [s.name, s.retailer ?? ''].map(norm).filter(Boolean)
      const score = names.some(n => n === target) ? 3
        : names.some(n => target.includes(n) || n.includes(target)) ? 2
        : 0
      return { s, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
  // Ambiguity (two equally good stores) is not guessed: wrong store data is worse than no data.
  if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].s.retailer !== scored[1].s.retailer) return null
  return scored[0]?.s ?? null
}

/** Receipt text in the format the API parses: `NAME UPC TOTAL` or `N @ EACH NAME TOTAL`. */
export function buildReceiptText(lines: ReceiptLineInput[]): string {
  const out: string[] = []
  for (const l of lines) {
    const name = l.name.replace(/\s+/g, ' ').trim()
    if (!name || !(l.unitPrice >= 0) || !Number.isFinite(l.unitPrice)) continue
    const qty = l.quantity && l.quantity > 1 && Number.isInteger(l.quantity) ? l.quantity : 1
    const total = (l.unitPrice * qty).toFixed(2)
    const code = l.barcode && /^\d{8,14}$/.test(l.barcode) ? ` ${l.barcode}` : ''
    out.push(qty > 1 ? `${qty} @ ${l.unitPrice.toFixed(2)} ${name}${code} ${total}` : `${name}${code} ${total}`)
  }
  return out.join('\n')
}

export async function submitReceiptToFoodIntelligence(receipt: ReceiptInput, deps?: GuardDeps): Promise<ReceiptSubmitResult | null> {
  const text = buildReceiptText(receipt.lines)
  if (!text) return null
  return guarded(async client => {
    const store = matchStore(await client.listStores(), receipt.storeName)
    if (!store) return null as unknown as ReceiptSubmitResult
    const res = await client.importReceipt({ storeId: store.id, text, purchasedAt: receipt.date ? `${receipt.date}T12:00:00Z` : undefined })
    return { storeId: store.id, matched: res.matched, unmatched: res.unmatched }
  }, deps)
}
