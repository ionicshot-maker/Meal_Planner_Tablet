// Standard UPC-A (12-digit) / EAN-13 (13-digit) checksum validation, plus the
// leading-zero equivalence between them (a UPC-A code prefixed with '0' is a
// valid EAN-13 encoding of the same product) — used to decide whether a
// number OCR'd off a receipt is trustworthy enough to treat as a real barcode
// identity, and to compare it against however the code is actually stored on
// an ingredient's variant.barcode (which is looked up as an exact string, so
// normalization has to happen on the candidate side, not the stored side).

export function extractDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function isValidBarcodeChecksum(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  const len = digits.length
  if (len !== 12 && len !== 13) return false

  const arr = digits.split('').map(Number)
  const checkDigit = arr[len - 1]
  const body = arr.slice(0, len - 1)

  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const pos = i + 1 // 1-indexed from the left
    const isOdd = pos % 2 === 1
    // UPC-A weights odd positions ×3; EAN-13 weights even positions ×3 — the
    // two systems are mirror images of each other over the same digit count.
    const weight = len === 12 ? (isOdd ? 3 : 1) : (isOdd ? 1 : 3)
    sum += body[i] * weight
  }
  const computed = (10 - (sum % 10)) % 10
  return computed === checkDigit
}

// All the string forms worth trying against a stored barcode field: the raw
// digits, and — since UPC-A and EAN-13 encode the same product — the
// leading-zero-added/stripped equivalent.
export function barcodeLookupCandidates(raw: string): string[] {
  const digits = extractDigits(raw)
  const candidates = new Set<string>([digits])
  if (digits.length === 13 && digits.startsWith('0')) candidates.add(digits.slice(1))
  if (digits.length === 12) candidates.add('0' + digits)
  return [...candidates]
}
