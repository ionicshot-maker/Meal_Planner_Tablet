// Standalone unit-conversion math for the Kitchen Reference Conversion
// Calculator. Deliberately separate from src/utils/units.ts (IngredientUnit /
// WeightUnit / VolumeUnit) — those types drive ingredient/recipe storage and
// nutrition math elsewhere in the app, and adding pt/qt/gal there would leak
// into every ingredient serving-unit dropdown. This is just a kitchen tool.

export type ConversionCategory = 'weight' | 'volume' | 'temperature'

export type ConversionUnit =
  | 'g' | 'kg' | 'oz' | 'lb'
  | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz' | 'pt' | 'qt' | 'gal'
  | 'f' | 'c'

interface UnitInfo {
  value: ConversionUnit
  label: string
  shortLabel: string
}

interface UnitGroup {
  category: ConversionCategory
  label: string
  units: UnitInfo[]
}

export const CONVERSION_UNIT_GROUPS: UnitGroup[] = [
  {
    category: 'weight',
    label: 'Weight',
    units: [
      { value: 'g',  label: 'g (grams)',     shortLabel: 'g' },
      { value: 'kg', label: 'kg (kilograms)', shortLabel: 'kg' },
      { value: 'oz', label: 'oz (ounces)',   shortLabel: 'oz' },
      { value: 'lb', label: 'lb (pounds)',   shortLabel: 'lb' },
    ],
  },
  {
    category: 'volume',
    label: 'Volume',
    units: [
      { value: 'ml',   label: 'ml (milliliters)',   shortLabel: 'ml' },
      { value: 'l',    label: 'l (liters)',         shortLabel: 'l' },
      { value: 'tsp',  label: 'tsp (teaspoons)',    shortLabel: 'tsp' },
      { value: 'tbsp', label: 'tbsp (tablespoons)', shortLabel: 'tbsp' },
      { value: 'cup',  label: 'cup (cups)',         shortLabel: 'cup' },
      { value: 'floz', label: 'fl oz (fluid ounces)', shortLabel: 'fl oz' },
      { value: 'pt',   label: 'pt (pints)',         shortLabel: 'pt' },
      { value: 'qt',   label: 'qt (quarts)',        shortLabel: 'qt' },
      { value: 'gal',  label: 'gal (gallons)',      shortLabel: 'gal' },
    ],
  },
  {
    category: 'temperature',
    label: 'Temperature',
    units: [
      { value: 'f', label: '°F (Fahrenheit)', shortLabel: '°F' },
      { value: 'c', label: '°C (Celsius)',    shortLabel: '°C' },
    ],
  },
]

const ALL_UNITS: UnitInfo[] = CONVERSION_UNIT_GROUPS.flatMap(g => g.units)

const WEIGHT_TO_G: Partial<Record<ConversionUnit, number>> = {
  g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
}

const VOLUME_TO_ML: Partial<Record<ConversionUnit, number>> = {
  ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, floz: 29.5735,
  pt: 473.176, qt: 946.353, gal: 3785.41,
}

export function categoryOf(unit: ConversionUnit): ConversionCategory {
  if (unit in WEIGHT_TO_G) return 'weight'
  if (unit in VOLUME_TO_ML) return 'volume'
  return 'temperature'
}

export function unitLabel(unit: ConversionUnit): string {
  return ALL_UNITS.find(u => u.value === unit)?.shortLabel ?? unit
}

function baseFactor(unit: ConversionUnit): number {
  return WEIGHT_TO_G[unit] ?? VOLUME_TO_ML[unit] ?? 1
}

/** Converts between two units of the same category. Returns null across categories (e.g. weight → volume, which needs ingredient density). */
export function convert(value: number, from: ConversionUnit, to: ConversionUnit): number | null {
  const catFrom = categoryOf(from)
  const catTo = categoryOf(to)
  if (catFrom !== catTo) return null
  if (Number.isNaN(value)) return null

  if (catFrom === 'temperature') {
    const celsius = from === 'f' ? (value - 32) * 5 / 9 : value
    return to === 'f' ? celsius * 9 / 5 + 32 : celsius
  }

  const base = value * baseFactor(from)
  return base / baseFactor(to)
}

/** A short human-readable line showing the math behind convert(), e.g. "12g ÷ 28.35 = 0.42 oz". */
export function formatFormula(value: number, from: ConversionUnit, to: ConversionUnit, result: number): string {
  const fromLabel = unitLabel(from)
  const toLabel = unitLabel(to)
  const v = formatNum(value)
  const r = formatNum(result)

  if (categoryOf(from) === 'temperature') {
    return from === 'f'
      ? `(${v}°F - 32) × 5/9 = ${r}°C`
      : `${v}°C × 9/5 + 32 = ${r}°F`
  }

  const fFrom = baseFactor(from)
  const fTo = baseFactor(to)
  if (fFrom === 1) return `${v}${fromLabel} ÷ ${formatNum(fTo)} = ${r}${toLabel}`
  if (fTo === 1) return `${v}${fromLabel} × ${formatNum(fFrom)} = ${r}${toLabel}`
  return `${v}${fromLabel} × ${formatNum(fFrom)} ÷ ${formatNum(fTo)} = ${r}${toLabel}`
}

function formatNum(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export const COOKING_SHORTCUTS: string[] = [
  '1 stick butter = 8 tbsp = ½ cup = 113g = 4oz',
  '1 cup = 16 tbsp = 48 tsp = 240ml',
  '1 lb = 16 oz = 453g',
  '1 gallon = 4 quarts = 8 pints = 16 cups',
  '350°F = 177°C (moderate oven)',
  '375°F = 191°C (moderate-hot oven)',
  '400°F = 204°C (hot oven)',
  '425°F = 218°C (very hot oven)',
  '1 dozen eggs = 12 eggs',
  'Pinch = approximately ⅛ tsp',
  'Dash = approximately ⅛ tsp',
]
