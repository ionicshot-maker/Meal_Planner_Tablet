import type { Macros, MacroLogEntry, NutrientGoals, Person, NutrientToggles } from '@/types'

export const ZERO_MACROS: Macros = {
  calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0,
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories:     a.calories + b.calories,
    protein:      a.protein  + b.protein,
    carbs:        a.carbs    + b.carbs,
    fiber:        a.fiber    + b.fiber,
    sugar:        a.sugar    + b.sugar,
    fat:          a.fat      + b.fat,
    sodium:       a.sodium   + b.sodium,
    saturatedFat: a.saturatedFat != null || b.saturatedFat != null
      ? (a.saturatedFat ?? 0) + (b.saturatedFat ?? 0) : undefined,
    transFat: a.transFat != null || b.transFat != null
      ? (a.transFat ?? 0) + (b.transFat ?? 0) : undefined,
    alcohol: a.alcohol != null || b.alcohol != null
      ? (a.alcohol ?? 0) + (b.alcohol ?? 0) : undefined,
  }
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    calories:     m.calories * factor,
    protein:      m.protein  * factor,
    carbs:        m.carbs    * factor,
    fiber:        m.fiber    * factor,
    sugar:        m.sugar    * factor,
    fat:          m.fat      * factor,
    sodium:       m.sodium   * factor,
    saturatedFat: m.saturatedFat != null ? m.saturatedFat * factor : undefined,
    transFat:     m.transFat     != null ? m.transFat     * factor : undefined,
    alcohol:      m.alcohol      != null ? m.alcohol      * factor : undefined,
  }
}

const META_SLOTS = new Set(['__water__', '__weight__'])

export function sumEntries(entries: MacroLogEntry[]): Macros {
  return entries
    .filter(e => !META_SLOTS.has(e.mealSlot))
    .reduce((acc, e) => addMacros(acc, scaleMacros(e.macros, e.servingsEaten)), { ...ZERO_MACROS })
}

export function roundMacro(n: number): number {
  return Math.round(n * 10) / 10
}

export function resolveGoals(person: Person): NutrientGoals | null {
  if (person.mode !== 'complex' || !person.goals) return null
  const g = person.goals
  if (person.goalMethod === 'percentage' && g.totalCalories) {
    const cal = g.totalCalories
    return {
      ...g,
      calories: cal,
      protein: g.proteinPct != null ? Math.round(cal * g.proteinPct / 100 / 4) : g.protein,
      carbs:   g.carbsPct   != null ? Math.round(cal * g.carbsPct   / 100 / 4) : g.carbs,
      fat:     g.fatPct     != null ? Math.round(cal * g.fatPct     / 100 / 9) : g.fat,
    }
  }
  return g
}

export type NutrientKey = keyof Macros

export const STANDARD_NUTRIENTS: NutrientKey[] = ['calories', 'protein', 'carbs', 'fiber', 'sugar', 'fat', 'sodium']

export function getActiveNutrients(toggles: NutrientToggles): NutrientKey[] {
  const optional: NutrientKey[] = []
  if (toggles.saturatedFat) optional.push('saturatedFat')
  if (toggles.transFat)     optional.push('transFat')
  if (toggles.alcohol)      optional.push('alcohol')
  return [...STANDARD_NUTRIENTS, ...optional]
}

const LABELS: Record<NutrientKey, string> = {
  calories: 'Calories', protein: 'Protein', carbs: 'Carbs',
  fiber: 'Fiber', sugar: 'Sugar', fat: 'Fat', sodium: 'Sodium',
  saturatedFat: 'Sat. Fat', transFat: 'Trans Fat', alcohol: 'Alcohol',
}
export function nutrientLabel(key: NutrientKey): string { return LABELS[key] }

export function nutrientUnit(key: NutrientKey): string {
  if (key === 'calories') return 'kcal'
  if (key === 'sodium')   return 'mg'
  return 'g'
}

export function formatNutrient(value: number | undefined, key: NutrientKey): string {
  if (value == null || isNaN(value)) return '—'
  const rounded = key === 'sodium' ? Math.round(value) : roundMacro(value)
  return `${rounded}${nutrientUnit(key)}`
}

export function compactMacros(macros: Macros, servings: number): string {
  const s = servings
  const cal = Math.round(macros.calories * s)
  const p   = roundMacro(macros.protein * s)
  const c   = roundMacro(macros.carbs   * s)
  const f   = roundMacro(macros.fat     * s)
  return `${cal} cal · ${p}g P · ${c}g C · ${f}g F`
}
