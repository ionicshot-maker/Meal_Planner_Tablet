// Common Open Food Facts brand slugs mapped to their clean display name.
// Keyed by the lowercase, hyphenated form so lookups work whether the raw
// value came in as a slug ("great-value") or already as a normal-looking
// string with different casing ("GREAT VALUE", "Great value").
const BRAND_SLUG_MAP: Record<string, string> = {
  'alani-nu': 'Alani Nu',
  'great-value': 'Great Value',
  "bush-s-best": "Bush's Best",
  'mccormick': 'McCormick',
  'land-o-lakes': 'Land O Lakes',
  'hidden-valley': 'Hidden Valley Ranch',
}

function toTitleCase(s: string): string {
  return s.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

// Runs before saving any ingredient — cleans up brand names from barcode
// scans, bulk entry, and JSON imports so near-identical brands (different
// casing, OFF's hyphenated slugs) collapse into one consistent display name,
// which in turn makes duplicate detection by brand actually work.
export function normalizeBrandName(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return trimmed

  const slug = trimmed.toLowerCase().replace(/\s+/g, '-')
  if (BRAND_SLUG_MAP[slug]) return BRAND_SLUG_MAP[slug]

  const spaced = trimmed.includes('-') ? trimmed.replace(/-+/g, ' ').trim() : trimmed
  const isAllLower = spaced === spaced.toLowerCase() && /[a-z]/.test(spaced)
  const isAllUpper = spaced === spaced.toUpperCase() && /[A-Z]/.test(spaced)

  if (isAllLower || isAllUpper) return toTitleCase(spaced)
  return spaced
}
