// Tracks the last few ingredients successfully linked from the recipe editor's
// ingredient picker, across all recipes, so the picker can surface them at the
// top of the list next time. Device-local (localStorage) — this is a UI
// convenience, not data worth syncing or persisting in IndexedDB.

const STORAGE_KEY = 'recently_linked_ingredients'
const MAX_ENTRIES = 10

export interface RecentLinkEntry {
  ingredientId: string
  variantId: string
}

export function getRecentlyLinked(): RecentLinkEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function recordLinked(ingredientId: string, variantId: string): void {
  try {
    const deduped = getRecentlyLinked().filter(
      e => !(e.ingredientId === ingredientId && e.variantId === variantId)
    )
    deduped.unshift({ ingredientId, variantId })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, MAX_ENTRIES)))
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — the
    // "recently used" section just won't have anything to show.
  }
}
