import type { Macros, MacroLogEntry, NutrientGoals, Person, NutrientToggles, Sex, ActivityLevel } from '@/types'

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

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  'very-active': 1.9,
}

// Mifflin-St Jeor's sex constant. 'other' uses -78, the midpoint of the
// male (+5) and female (-161) constants - the commonly cited convention for
// applying this formula outside the male/female binary it was validated on.
// No existing convention for this elsewhere in the app to follow (`sex` is
// only ever used for the Select's option list today, never in a formula).
const SEX_CONSTANT: Record<Sex, number> = {
  male: 5,
  female: -161,
  other: -78,
}

const LB_TO_KG = 0.453592
const IN_TO_CM = 2.54

// Mifflin-St Jeor BMR + activity-multiplier TDEE, from a person's stored
// profile (Person.weight/height, not the daily-logged weight - that
// staleness comparison is a separate, later phase). Returns null rather
// than throwing whenever a required field is missing or non-positive, so
// callers can distinguish "couldn't calculate" from a real result without
// a try/catch - the null case is exactly what a future missing-data UI
// needs to detect.
export function calculateTDEE(person: Person): { bmr: number; tdee: number } | null {
  const { age, weight, height, sex, activityLevel } = person
  if (
    age == null || age <= 0 ||
    weight == null || weight <= 0 ||
    height == null || height <= 0 ||
    sex == null ||
    activityLevel == null
  ) {
    return null
  }

  const weightKg = weight * LB_TO_KG
  const heightCm = height * IN_TO_CM
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANT[sex]
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  }
}

// Drift (lbs) between Person.weight and the most recent logged weight entry
// before a nudge is worth surfacing - larger than typical day-to-day
// water-weight/hydration fluctuation (commonly a few lbs), but still small
// enough to matter to the Mifflin-St Jeor estimate above (5 lbs ≈ 2.27 kg,
// a ~23 kcal shift in BMR alone before the activity multiplier).
const WEIGHT_STALENESS_THRESHOLD_LBS = 5

export interface WeightStalenessResult {
  isStale: boolean
  profileWeight: number
  loggedWeight: number | null
  loggedDate: string | null
  driftLbs: number | null
}

// Compares Person.weight (the static profile field TDEE actually uses) against
// the most recent '__weight__' log entry, to detect drift worth a future
// Phase 3 nudge - does NOT change which weight the calculation itself uses.
// Takes already-loaded entries rather than querying IndexedDB itself, same
// separation of data-loading vs. calculation this file already follows
// (see sumEntries() above, which filters/reduces a raw entries array rather
// than fetching one) - `recentLogs` need not be pre-filtered by person or
// slot; this function does that itself, like sumEntries() does for META_SLOTS.
// Returns null only when Person.weight itself is missing (mirroring
// calculateTDEE()'s null-contract for missing required profile data) - a
// person with no logged weight entries at all is a different, normal state
// (trackWeight off, or simply never logged), not an error: isStale is false
// and loggedWeight/loggedDate/driftLbs are null, not the whole result.
export function checkWeightStaleness(person: Person, recentLogs: MacroLogEntry[]): WeightStalenessResult | null {
  const profileWeight = person.weight
  if (profileWeight == null || profileWeight <= 0) return null

  const weightEntries = recentLogs.filter(e => e.personId === person.id && e.mealSlot === '__weight__' && e.weightLbs != null)
  if (weightEntries.length === 0) {
    return { isStale: false, profileWeight, loggedWeight: null, loggedDate: null, driftLbs: null }
  }

  const mostRecent = weightEntries.reduce((latest, e) => e.date > latest.date ? e : latest)
  const loggedWeight = mostRecent.weightLbs!
  const driftLbs = loggedWeight - profileWeight

  return {
    isStale: Math.abs(driftLbs) >= WEIGHT_STALENESS_THRESHOLD_LBS,
    profileWeight,
    loggedWeight,
    loggedDate: mostRecent.date,
    driftLbs,
  }
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
