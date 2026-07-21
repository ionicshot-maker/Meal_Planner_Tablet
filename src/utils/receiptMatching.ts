import { findSmartMatches } from './smartDuplicate'
import { normalizeBrandName } from './brandNormalization'
import { barcodeLookupCandidates, isValidBarcodeChecksum } from './barcodeValidation'
import type { Ingredient, IngredientVariant } from '@/types'
import type { NormalizedLine } from './receiptPriceNormalization'

export type MatchSource = 'barcode' | 'name'
export type ConfidenceTier = 'high' | 'medium' | 'none'

export interface RankedCandidate {
  ingredient: Ingredient
  variant?: IngredientVariant
  source: MatchSource
}

export interface LineMatchResult {
  tier: ConfidenceTier
  candidates: RankedCandidate[]
  // Set when a checksum-valid barcode found a match — barcode identity always
  // wins over fuzzy name matching and is never overridden by it.
  barcodeMatch?: RankedCandidate
  // True when the barcode-matched ingredient's name doesn't also turn up in
  // a name-based search for the receipt's text — surfaced to the user rather
  // than silently trusting either signal.
  barcodeTextDisagreement: boolean
  // True when the barcode matched more than one ingredient record (shouldn't
  // normally happen, but the same class of duplicate-data problem this app
  // spent a long session fixing elsewhere means it's worth checking for).
  barcodeMultiMatch: boolean
  validBarcode?: string
}

// A weight-based purchase's servings can usually be derived directly from the
// matched ingredient's own serving size (e.g. "100g servings") and the weight
// actually purchased — no need to ask the user for something the app already
// knows how to compute.
export function deriveServingsFromWeight(weightLbs: number, variant: IngredientVariant | undefined): number | null {
  if (!variant || weightLbs <= 0) return null
  const grams = weightLbs * 453.592
  switch (variant.servingUnit) {
    case 'g': return variant.servingSize > 0 ? Math.round((grams / variant.servingSize) * 100) / 100 : null
    case 'kg': return variant.servingSize > 0 ? Math.round((grams / 1000 / variant.servingSize) * 100) / 100 : null
    case 'oz': return variant.servingSize > 0 ? Math.round((weightLbs * 16 / variant.servingSize) * 100) / 100 : null
    case 'lb': return variant.servingSize > 0 ? Math.round((weightLbs / variant.servingSize) * 100) / 100 : null
    default: return null
  }
}

export function candidateLabel(c: RankedCandidate): string {
  const brand = c.variant?.brand ?? c.ingredient.variants[0]?.brand
  return brand ? `${c.ingredient.name} — ${brand}` : c.ingredient.name
}

export interface CandidateSelection {
  selectedIngredientId: string
  selectedVariantId?: string
  servings: string
  priceDecision: 'not-needed' | 'pending'
}

// The single place that decides what picking a candidate (whether that pick
// was automatic for a high-confidence row, or manual from the "pick a match"
// list) does to the rest of the row's fields — used identically by the
// initial auto-select and the manual re-pick so the two paths can't drift
// into different behavior for the same situation.
export function resolveCandidateSelection(
  line: NormalizedLine,
  candidate: RankedCandidate,
  fallbackServings: string,
  unitPrice: number
): CandidateSelection {
  let servings = fallbackServings
  if (line.isWeightBased && line.effectiveQuantity > 0) {
    const derived = deriveServingsFromWeight(line.effectiveQuantity, candidate.variant)
    if (derived != null) servings = String(derived)
    else if (candidate.variant?.totalServingsInPackage != null) servings = String(candidate.variant.totalServingsInPackage)
  } else if (candidate.variant?.totalServingsInPackage != null) {
    servings = String(candidate.variant.totalServingsInPackage)
  }

  const existingPrice = candidate.variant?.packageCost
  const priceDecision = existingPrice != null && existingPrice !== unitPrice ? 'pending' : 'not-needed'

  return {
    selectedIngredientId: candidate.ingredient.id,
    selectedVariantId: candidate.variant?.id,
    servings,
    priceDecision,
  }
}

function findVariantForBrand(ingredient: Ingredient, line: NormalizedLine): IngredientVariant | undefined {
  // A single-variant ingredient has no real brand ambiguity to resolve —
  // that one variant is the match regardless of whether the receipt's text
  // happens to spell out the brand name.
  if (ingredient.variants.length === 1) return ingredient.variants[0]

  const haystack = `${line.rawText} ${line.parsedName}`.toLowerCase()
  return ingredient.variants.find(v => {
    const brand = normalizeBrandName(v.brand).toLowerCase()
    return brand.length > 2 && haystack.includes(brand)
  })
}

// Same exact-string comparison findBarcodeMatch uses (variant.barcode === code),
// just not short-circuiting on the first hit — needed to detect the case where
// more than one ingredient record carries the same barcode.
function findAllBarcodeMatches(code: string, ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter(ing => ing.variants.some(v => v.barcode === code))
}

// Reuses the app's existing duplicate-detection primitives (findBarcodeMatch /
// findSmartMatches — the same ones ReviewScreen.tsx uses when saving a single
// ingredient) rather than a separate scoring system, so the Receipt Scanner
// can't drift out of sync with how "is this the same product" is decided
// everywhere else in the app. The only new logic here is barcode-priority
// sequencing and surfacing disagreement/multi-match cases for review.
export function matchLine(line: NormalizedLine, allIngredients: Ingredient[]): LineMatchResult {
  // 1. Barcode — checksum-validated first, since an unvalidated OCR digit
  // string is exactly the kind of "looks legible" false confidence to avoid.
  if (line.barcodeText) {
    for (const candidate of barcodeLookupCandidates(line.barcodeText)) {
      if (!isValidBarcodeChecksum(candidate)) continue

      const allMatches = findAllBarcodeMatches(candidate, allIngredients)
      if (allMatches.length === 0) continue

      const nameMatches = findSmartMatches(line.parsedName, allIngredients)
      const disagreement = nameMatches.length > 0 && !nameMatches.some(m => m.id === allMatches[0].id)

      if (allMatches.length > 1) {
        return {
          tier: 'medium',
          candidates: allMatches.map(ing => ({ ingredient: ing, variant: findVariantForBrand(ing, line), source: 'barcode' as const })),
          barcodeTextDisagreement: disagreement,
          barcodeMultiMatch: true,
          validBarcode: candidate,
        }
      }

      const ingredient = allMatches[0]
      const variant = ingredient.variants.find(v => v.barcode === candidate)
      const barcodeMatch: RankedCandidate = { ingredient, variant, source: 'barcode' }
      return {
        tier: 'high',
        candidates: [barcodeMatch],
        barcodeMatch,
        barcodeTextDisagreement: disagreement,
        barcodeMultiMatch: false,
        validBarcode: candidate,
      }
    }
  }

  // 2. Fuzzy name/brand — findSmartMatches is a boolean pass/fail per
  // ingredient (exact name, close edit distance, or full keyword-subset
  // match); when it returns more than one, order brand-mentioned-in-the-
  // receipt-text matches first purely for display, not as a separate gate.
  const nameMatches = findSmartMatches(line.parsedName, allIngredients)
  const ordered = [...nameMatches].sort((a, b) => {
    const av = findVariantForBrand(a, line) ? 1 : 0
    const bv = findVariantForBrand(b, line) ? 1 : 0
    return bv - av
  })
  const candidates = ordered.slice(0, 5).map(ing => ({ ingredient: ing, variant: findVariantForBrand(ing, line), source: 'name' as const }))

  if (candidates.length === 0) {
    return { tier: 'none', candidates: [], barcodeTextDisagreement: false, barcodeMultiMatch: false }
  }
  return {
    tier: candidates.length === 1 ? 'high' : 'medium',
    candidates,
    barcodeTextDisagreement: false,
    barcodeMultiMatch: false,
  }
}

