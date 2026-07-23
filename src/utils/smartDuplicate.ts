import { barcodeLookupCandidates, isValidBarcodeChecksum } from './barcodeValidation'
import type { Ingredient, IngredientVariant } from '@/types'

export function editDistance(a: string, b: string): number {
  const la = a.toLowerCase(), lb = b.toLowerCase()
  const m = la.length, n = lb.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = la[i - 1] === lb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

export function keywords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1)
}

function allKeywordsMatch(a: string, b: string): boolean {
  const ka = keywords(a)
  const kb = keywords(b)
  if (ka.length === 0 || kb.length === 0) return false
  const [shorter, longer] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
  const longerSet = new Set(longer)
  return shorter.every(k => longerSet.has(k))
}

export function findSmartMatches(name: string, existing: Ingredient[]): Ingredient[] {
  const norm = name.trim().toLowerCase()
  if (!norm) return []
  return existing.filter(ing => {
    const t = ing.name.toLowerCase()
    if (t === norm) return true
    if (editDistance(norm, t) <= 2) return true
    return allKeywordsMatch(norm, t)
  })
}

// ─── Barcode matching — the single shared implementation for the whole app ───
// Previously each caller (ReviewScreen.tsx's inline check, findIngredientByBarcode,
// Receipt Scanner's own private helper, this file's old findBarcodeMatch) did its
// own plain `===` comparison, with no checksum validation or leading-zero handling
// anywhere except Receipt Scanner's matchLine(). That divergence meant the
// already-fixed leading-zero duplicate bug (Ingredient Converter, see
// MealPlannerApp_Reference.md) could still be reproduced through barcode scanning,
// manual entry, or ReviewScreen's dedup path — a barcode stored without its
// leading zero (from an old pre-v5 import) would never match a fresh, correctly-
// zero-padded scan of the same physical product via plain string equality.
//
// Two-tier strategy, applied everywhere now:
//   1. Exact match on the raw string, unconditionally — preserves all existing
//      behavior for any barcode already in the database, checksum-valid or not
//      (e.g. a non-standard/internal code someone typed in on purpose). Zero
//      regression risk.
//   2. Only if no exact match: expand to the checksum-valid UPC-A/EAN-13
//      leading-zero-equivalent candidates (the exact same `barcodeLookupCandidates`
//      + `isValidBarcodeChecksum` pipeline Receipt Scanner already uses) and try
//      those. Checksum validation here matters for the same reason it matters in
//      Receipt Scanner: without it, an arbitrary short digit string could coincide
//      with something unrelated.
function checksumValidCandidates(raw: string): string[] {
  return barcodeLookupCandidates(raw).filter(isValidBarcodeChecksum)
}

export function findAllBarcodeMatches(barcode: string | undefined | null, existing: Ingredient[]): Ingredient[] {
  const raw = barcode?.trim()
  if (!raw) return []

  const exact = existing.filter(ing => ing.variants.some(v => v.barcode === raw))
  if (exact.length > 0) return exact

  const candidates = checksumValidCandidates(raw).filter(c => c !== raw)
  if (candidates.length === 0) return []
  const candidateSet = new Set(candidates)
  return existing.filter(ing => ing.variants.some(v => v.barcode && candidateSet.has(v.barcode)))
}

// Barcode is the strongest possible identity signal — if two products share a
// barcode they are definitely the same item, so this check always runs first
// and, when it hits, skips name/brand comparison entirely. First hit only —
// use findAllBarcodeMatches directly to detect the (rare, data-integrity-flagging)
// case where more than one ingredient record shares a barcode.
export function findBarcodeMatch(barcode: string | undefined | null, existing: Ingredient[]): Ingredient | undefined {
  return findAllBarcodeMatches(barcode, existing)[0]
}

// Once the matching ingredient is already known (e.g. from findBarcodeMatch
// above), find which of ITS variants actually carries the matching barcode —
// same two-tier exact-then-candidate logic, needed because the variant that
// matched might not carry the literal raw scanned string (e.g. it matched via
// the leading-zero-equivalent tier).
export function findMatchingVariant(barcode: string | undefined | null, ingredient: Ingredient): IngredientVariant | undefined {
  const raw = barcode?.trim()
  if (!raw) return undefined

  const exact = ingredient.variants.find(v => v.barcode === raw)
  if (exact) return exact

  const candidates = checksumValidCandidates(raw).filter(c => c !== raw)
  if (candidates.length === 0) return undefined
  const candidateSet = new Set(candidates)
  return ingredient.variants.find(v => v.barcode && candidateSet.has(v.barcode))
}
