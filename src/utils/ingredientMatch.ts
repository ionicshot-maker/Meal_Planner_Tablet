// Shared fuzzy-matching used by the recipe editor's ingredient suggestion
// dropdown and the ingredient link picker modal.

const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'or', 'in'])

function significantWords(s: string): string[] {
  return s.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

/**
 * Scores how well a database ingredient `name` matches a free-text `query`
 * (e.g. a recipe ingredient line like "boneless skinless chicken breast").
 * Higher is better; 0 means no match. Exact/prefix/substring matches rank
 * highest; a loose shared-word match (e.g. "chicken breast" found inside a
 * longer descriptive query) still scores above zero so it surfaces as a
 * suggestion instead of being filtered out entirely.
 */
export function scoreIngredientMatch(name: string, query: string): number {
  const n = name.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  if (n === q) return 100
  if (n.startsWith(q)) return 80
  if (n.includes(q)) return 60
  if (n.split(/\s+/).some(w => w.startsWith(q))) return 40
  if (q.split(/\s+/).every(qw => n.includes(qw))) return 20

  const nWords = significantWords(n)
  const qWords = significantWords(q)
  const overlap = nWords.filter(w => qWords.includes(w)).length
  if (overlap > 0) return Math.min(18, 6 + overlap * 6)

  return 0
}
