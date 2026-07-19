import type { Ingredient } from '@/types'

function editDistance(a: string, b: string): number {
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

function keywords(s: string): string[] {
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

// Barcode is the strongest possible identity signal — if two products share a
// barcode they are definitely the same item, so this check always runs first
// and, when it hits, skips name/brand comparison entirely.
export function findBarcodeMatch(barcode: string | undefined | null, existing: Ingredient[]): Ingredient | undefined {
  const code = barcode?.trim()
  if (!code) return undefined
  return existing.find(ing => ing.variants.some(v => v.barcode === code))
}
