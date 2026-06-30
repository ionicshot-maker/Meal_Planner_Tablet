// Map of unicode fraction characters to their decimal values
const UNICODE_FRACS: Record<string, number> = {
  '½': 0.5,   '¼': 0.25,  '¾': 0.75,
  '⅓': 1/3,   '⅔': 2/3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅕': 0.2,   '⅖': 0.4,   '⅗': 0.6,   '⅘': 0.8,
  '⅙': 1/6,   '⅚': 5/6,
}

/**
 * Parse a string like "1/4", "1 1/2", "2.5", "½", "1½", ".25" to a number.
 * Returns null if the string cannot be meaningfully parsed.
 */
export function parseFraction(raw: string): number | null {
  if (!raw || !raw.trim()) return null

  let s = raw.trim()

  // Normalize leading-decimal: ".25" → "0.25"
  if (/^\.\d/.test(s)) s = '0' + s

  // Substitute unicode fractions with their decimal string representation
  for (const [ch, val] of Object.entries(UNICODE_FRACS)) {
    // Unicode frac immediately after a digit means mixed number: "1½" → "1 0.5"
    s = s.replace(new RegExp(`(\\d)${ch}`, 'g'), `$1 ${val}`)
    s = s.replace(new RegExp(ch, 'g'), ` ${val}`)
  }
  s = s.trim()

  // "whole fraction" e.g. "1 1/2" or "1 0.5"
  const spaceIdx = s.indexOf(' ')
  if (spaceIdx !== -1) {
    const left  = s.slice(0, spaceIdx)
    const right = s.slice(spaceIdx + 1).trim()
    const whole = parseSimple(left)
    const frac  = parseSimple(right)
    if (whole !== null && frac !== null && frac >= 0) {
      return whole + frac
    }
  }

  return parseSimple(s)
}

function parseSimple(s: string): number | null {
  if (s.includes('/')) {
    const [n, d] = s.split('/')
    const num  = parseFloat(n)
    const denom = parseFloat(d)
    if (isNaN(num) || isNaN(denom) || denom === 0) return null
    return num / denom
  }
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/** Format a number for display in a numeric input (4dp max, no trailing zeros). */
export function formatNumeric(n: number): string {
  if (!isFinite(n)) return ''
  return parseFloat(n.toFixed(4)).toString()
}
