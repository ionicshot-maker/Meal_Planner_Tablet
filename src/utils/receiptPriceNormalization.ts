// Raw fields extracted from a single receipt line by the AI parser — deliberately
// dumb (no arithmetic), since per-unit price math is done deterministically here
// rather than trusted to the model.
export interface ParsedReceiptLine {
  rawText: string
  parsedName: string
  quantity: number | null
  extendedPrice: number
  unitPriceStated: number | null
  multiBuyText: string | null
  isWeightBased: boolean
  weightLbs: number | null
  categoryHint: string | null
  // A numeric code printed next to the item, if any (many receipts print a
  // UPC/PLU alongside the name) — not yet validated as a real barcode here,
  // that's receiptMatching.ts's job (checksum + lookup).
  barcodeText: string | null
}

export interface MultiBuyResult {
  count: number
  unitPrice: number
}

// Handles the formats seen in practice — extend with more patterns as other
// stores' receipts turn up different conventions.
export function parseMultiBuyLine(text: string | null | undefined): MultiBuyResult | null {
  if (!text) return null
  const t = text.trim()

  // "2 @2/5.00" — N units, deal price Y for a dealCount-pack
  const dealMatch = t.match(/^(\d+)\s*@\s*(\d+)\s*\/\s*(\d+(?:\.\d{1,2})?)$/)
  if (dealMatch) {
    const [, qtyStr, dealCountStr, dealPriceStr] = dealMatch
    const dealCount = Number(dealCountStr)
    const dealPrice = Number(dealPriceStr)
    if (dealCount > 0) {
      return { count: Number(qtyStr), unitPrice: dealPrice / dealCount }
    }
  }

  // "2 @4.98" — N units at a stated per-unit price
  const perUnitMatch = t.match(/^(\d+)\s*@\s*\$?(\d+(?:\.\d{1,2})?)$/)
  if (perUnitMatch) {
    const [, qtyStr, priceStr] = perUnitMatch
    return { count: Number(qtyStr), unitPrice: Number(priceStr) }
  }

  // "@ $3.98/lb" — weight-based per-lb price
  const perLbMatch = t.match(/@?\s*\$?(\d+(?:\.\d{1,2})?)\s*\/\s*lb/i)
  if (perLbMatch) {
    return { count: 1, unitPrice: Number(perLbMatch[1]) }
  }

  return null
}

export type NormalizationConfidence = 'parsed' | 'guessed' | 'unparsed'

export interface NormalizedLine extends ParsedReceiptLine {
  // The reusable per-unit/per-lb price — this is what should become
  // packageCost for an EXISTING ingredient's restock price. For a
  // weight-based line, this is the per-lb price (not scaled to what was
  // bought this trip).
  unitPrice: number
  // For weight-based lines only: unitPrice x weightLbs — what this specific
  // purchase actually cost, matching how a variable-weight item's packageCost
  // was decided by hand (scale price and servings to the actual weight
  // purchased, not a generic per-lb default).
  scaledPrice: number | null
  effectiveQuantity: number
  normalizationConfidence: NormalizationConfidence
  // Present only when a multi-buy total didn't cleanly match unitPrice * quantity,
  // so the review UI can surface it as a sanity-check warning without blocking.
  crossCheckWarning: string | null
}

// The single funnel every parsed receipt line goes through before matching or
// display — every value here is a starting point for the review UI, not a
// final answer, since receipt formats vary by store.
export function normalizeLine(line: ParsedReceiptLine): NormalizedLine {
  const multiBuy = parseMultiBuyLine(line.multiBuyText)

  if (multiBuy) {
    const expectedTotal = multiBuy.unitPrice * multiBuy.count
    const crossCheckWarning =
      Math.abs(expectedTotal - line.extendedPrice) > 0.02
        ? `Multi-buy math (${multiBuy.count} × $${multiBuy.unitPrice.toFixed(2)} = $${expectedTotal.toFixed(2)}) doesn't quite match the receipt total ($${line.extendedPrice.toFixed(2)}) — double-check.`
        : null
    return {
      ...line,
      unitPrice: multiBuy.unitPrice,
      scaledPrice: null,
      effectiveQuantity: multiBuy.count,
      normalizationConfidence: 'parsed',
      crossCheckWarning,
    }
  }

  if (line.isWeightBased) {
    // Scale to the actual weight purchased when both the per-lb price and the
    // weight are known — same approach used by hand for a real weight-based
    // item (Ground Round: $3.98/lb x 2.24lb = $8.92, not a flat $3.98).
    const perLb = line.unitPriceStated
    const weight = line.weightLbs
    if (perLb != null && weight != null) {
      return {
        ...line,
        unitPrice: perLb,
        scaledPrice: Math.round(perLb * weight * 100) / 100,
        effectiveQuantity: weight,
        normalizationConfidence: 'parsed',
        crossCheckWarning: null,
      }
    }
    // Weight wasn't printed/read — fall back to treating the line total as
    // this trip's cost; the review UI still lets the user turn this into a
    // real per-lb price if they know it.
    return {
      ...line,
      unitPrice: perLb ?? line.extendedPrice,
      scaledPrice: perLb != null ? null : line.extendedPrice,
      effectiveQuantity: weight ?? 1,
      normalizationConfidence: perLb != null ? 'guessed' : 'guessed',
      crossCheckWarning: null,
    }
  }

  if (line.unitPriceStated != null) {
    return {
      ...line,
      unitPrice: line.unitPriceStated,
      scaledPrice: null,
      effectiveQuantity: line.quantity ?? 1,
      normalizationConfidence: 'parsed',
      crossCheckWarning: null,
    }
  }

  const qty = line.quantity ?? 1
  return {
    ...line,
    unitPrice: qty > 0 ? line.extendedPrice / qty : line.extendedPrice,
    scaledPrice: null,
    effectiveQuantity: qty,
    normalizationConfidence: qty > 1 ? 'guessed' : 'parsed',
    crossCheckWarning: null,
  }
}
