import type { UnitSystem, IngredientUnit, WeightUnit, VolumeUnit } from '@/types'

// ─── Weight conversions (base: grams) ────────────────────────────────────────
const WEIGHT_TO_G: Record<WeightUnit, number> = {
  g:  1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
}

// ─── Volume conversions (base: ml) ───────────────────────────────────────────
const VOLUME_TO_ML: Record<VolumeUnit, number> = {
  ml:   1,
  l:    1000,
  tsp:  4.92892,
  tbsp: 14.7868,
  cup:  236.588,
  floz: 29.5735,
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  const grams = value * WEIGHT_TO_G[from]
  return grams / WEIGHT_TO_G[to]
}

export function convertVolume(value: number, from: VolumeUnit, to: VolumeUnit): number {
  if (from === to) return value
  const ml = value * VOLUME_TO_ML[from]
  return ml / VOLUME_TO_ML[to]
}

const WEIGHT_UNITS_IMPERIAL: WeightUnit[] = ['oz', 'lb']
const WEIGHT_UNITS_METRIC: WeightUnit[]   = ['g', 'kg']
const VOLUME_UNITS_IMPERIAL: VolumeUnit[] = ['tsp', 'tbsp', 'cup', 'floz']
const VOLUME_UNITS_METRIC: VolumeUnit[]   = ['ml', 'l', 'tsp', 'tbsp']

export function preferredWeightUnit(system: UnitSystem): WeightUnit {
  return system === 'imperial' ? 'oz' : 'g'
}

export function preferredVolumeUnit(system: UnitSystem): VolumeUnit {
  return system === 'imperial' ? 'cup' : 'ml'
}

export function availableUnits(system: UnitSystem): IngredientUnit[] {
  const weight = system === 'imperial' ? WEIGHT_UNITS_IMPERIAL : WEIGHT_UNITS_METRIC
  const volume = system === 'imperial' ? VOLUME_UNITS_IMPERIAL : VOLUME_UNITS_METRIC
  const count: IngredientUnit[] = ['each', 'package', 'jar', 'can', 'bag', 'box', 'slice', 'piece']
  return [...weight, ...volume, ...count]
}

export function formatQuantity(value: number, unit: IngredientUnit): string {
  const rounded = Math.round(value * 100) / 100
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '')
  return `${formatted} ${unit}`
}

export function parseTimeToMinutes(input: string): number {
  // Accept "90 min", "1h30", "1 hr 30 min", "90", etc.
  const hourMatch = input.match(/(\d+)\s*h(?:r|ours?)?/i)
  const minMatch  = input.match(/(\d+)\s*m(?:in(?:utes?)?)?/i)
  const bareNum   = !hourMatch && !minMatch ? parseInt(input, 10) : null

  const hours   = hourMatch ? parseInt(hourMatch[1], 10) : 0
  const minutes = minMatch  ? parseInt(minMatch[1], 10)  : (bareNum ?? 0)
  return hours * 60 + minutes
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}
