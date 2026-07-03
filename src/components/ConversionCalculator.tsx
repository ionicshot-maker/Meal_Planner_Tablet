import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import {
  CONVERSION_UNIT_GROUPS, categoryOf, convert, formatFormula, COOKING_SHORTCUTS,
  type ConversionUnit,
} from '@/utils/conversions'
import styles from './ConversionCalculator.module.css'

interface Props {
  initialValue?: number
  initialUnit?: ConversionUnit
  /** Hides the cooking-shortcuts list — used in the small recipe-editor popover. */
  hideShortcuts?: boolean
}

function UnitSelect({ value, onChange, id }: { value: ConversionUnit; onChange: (u: ConversionUnit) => void; id: string }) {
  return (
    <select
      id={id}
      className={styles.unitSelect}
      value={value}
      onChange={e => onChange(e.target.value as ConversionUnit)}
    >
      {CONVERSION_UNIT_GROUPS.map(group => (
        <optgroup key={group.category} label={group.label}>
          {group.units.map(u => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

const DEFAULT_PAIR: Partial<Record<ConversionUnit, ConversionUnit>> = {
  g: 'oz', kg: 'lb', oz: 'g', lb: 'kg',
  ml: 'floz', l: 'qt', tsp: 'tbsp', tbsp: 'tsp', cup: 'ml', floz: 'ml', pt: 'cup', qt: 'l', gal: 'l',
  f: 'c', c: 'f',
}

export function ConversionCalculator({ initialValue, initialUnit, hideShortcuts }: Props) {
  const [fromUnit, setFromUnit] = useState<ConversionUnit>(initialUnit ?? 'g')
  const [toUnit, setToUnit] = useState<ConversionUnit>(DEFAULT_PAIR[initialUnit ?? 'g'] ?? 'oz')
  const [fromText, setFromText] = useState(initialValue != null ? String(initialValue) : '1')

  const fromValue = parseFloat(fromText)
  const hasValue = fromText.trim() !== '' && !Number.isNaN(fromValue)
  const sameCategory = categoryOf(fromUnit) === categoryOf(toUnit)
  const result = hasValue && sameCategory ? convert(fromValue, fromUnit, toUnit) : null

  function handleSwap() {
    setFromUnit(toUnit)
    setToUnit(fromUnit)
    if (result !== null) setFromText(String(Math.round(result * 100) / 100))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <label className={styles.rowLabel} htmlFor="conv-from-value">From</label>
        <input
          id="conv-from-value"
          type="number"
          inputMode="decimal"
          className={styles.valueInput}
          value={fromText}
          onChange={e => setFromText(e.target.value)}
        />
        <UnitSelect id="conv-from-unit" value={fromUnit} onChange={setFromUnit} />
      </div>

      <button type="button" className={styles.swapBtn} onClick={handleSwap} aria-label="Swap conversion direction">
        <ArrowUpDown size={16} />
      </button>

      <div className={styles.row}>
        <label className={styles.rowLabel} htmlFor="conv-to-unit">To</label>
        <div className={styles.resultDisplay}>
          {result !== null
            ? (Math.round(result * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '—'}
        </div>
        <UnitSelect id="conv-to-unit" value={toUnit} onChange={setToUnit} />
      </div>

      {!sameCategory && (
        <p className={styles.mismatch}>
          Can't convert {categoryOf(fromUnit)} directly to {categoryOf(toUnit)} — pick two units from the same category.
        </p>
      )}

      {result !== null && (
        <p className={styles.formula}>{formatFormula(fromValue, fromUnit, toUnit, result)}</p>
      )}

      {!hideShortcuts && (
        <div className={styles.shortcuts}>
          <p className={styles.shortcutsTitle}>Common cooking conversions</p>
          <ul className={styles.shortcutsList}>
            {COOKING_SHORTCUTS.map(line => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
