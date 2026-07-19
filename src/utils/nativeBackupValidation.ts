const VALID_SCOPES = new Set(['ingredients', 'cookbook', 'full'])

function isValidNativeVariant(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const variant = v as Record<string, unknown>
  return typeof variant.id === 'string'
    && typeof variant.brand === 'string'
    && typeof variant.macros === 'object' && variant.macros !== null && !Array.isArray(variant.macros)
}

function isValidNativeIngredient(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const ing = item as Record<string, unknown>
  return typeof ing.id === 'string'
    && typeof ing.name === 'string'
    && Array.isArray(ing.variants)
    && ing.variants.every(isValidNativeVariant)
}

// Settings → Data → Export always writes { version, exportedAt, scope, ...arrays }
// — every native backup has all three of those envelope fields together, which
// no third-party file (e.g. an Open Food Facts converter export) happens to
// replicate. As a second layer, if an `ingredients` array is present its items
// must carry a nested `macros` object per variant rather than flat macro
// fields — the exact shape mismatch that corrupted the database previously.
export function isNativeBackupFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const d = data as Record<string, unknown>

  if (typeof d.version !== 'number') return false
  if (typeof d.exportedAt !== 'string') return false
  if (typeof d.scope !== 'string' || !VALID_SCOPES.has(d.scope)) return false

  if (Array.isArray(d.ingredients) && d.ingredients.length > 0) {
    if (!d.ingredients.every(isValidNativeIngredient)) return false
  }

  return true
}
