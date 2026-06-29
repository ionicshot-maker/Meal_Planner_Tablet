import { useState, useEffect } from 'react'
import type { Macros } from '@/types'
import { roundMacro } from '@/utils/macroUtils'
import styles from './MacroItemRow.module.css'

interface Props {
  label: string
  isLeftover?: boolean
  macrosPerServing: Macros | null
  servings: number
  onServingsChange: (servings: number) => void
  onDelete?: () => void
}

export function MacroItemRow({ label, isLeftover, macrosPerServing, servings, onServingsChange, onDelete }: Props) {
  const [inputVal, setInputVal] = useState(servings > 0 ? servings.toString() : '')

  useEffect(() => {
    setInputVal(servings > 0 ? servings.toString() : '')
  }, [servings])

  function commit(raw: string) {
    const n = parseFloat(raw)
    const clamped = isNaN(n) ? 0 : Math.max(0, Math.round(n * 4) / 4)
    setInputVal(clamped > 0 ? clamped.toString() : '')
    if (clamped !== servings) onServingsChange(clamped)
  }

  function step(delta: number) {
    const next = Math.max(0, Math.round((servings + delta) * 4) / 4)
    setInputVal(next > 0 ? next.toString() : '')
    if (next !== servings) onServingsChange(next)
  }

  const isLogged = servings > 0
  const consumed = macrosPerServing && isLogged ? {
    cal: Math.round(macrosPerServing.calories * servings),
    p:   roundMacro(macrosPerServing.protein  * servings),
    c:   roundMacro(macrosPerServing.carbs    * servings),
    f:   roundMacro(macrosPerServing.fat      * servings),
  } : null

  return (
    <div className={`${styles.row} ${isLogged ? styles.rowLogged : ''}`}>
      <div className={styles.info}>
        <div className={styles.labelRow}>
          <span className={styles.itemName}>{label}</span>
          {isLeftover && <span className={styles.leftoverBadge}>leftover</span>}
        </div>
        {consumed ? (
          <span className={styles.consumed}>
            {consumed.cal} cal · {consumed.p}g P · {consumed.c}g C · {consumed.f}g F
          </span>
        ) : isLogged && !macrosPerServing ? (
          <span className={styles.noMacros}>No macro data linked</span>
        ) : !isLogged ? (
          <span className={styles.unlogged}>not logged</span>
        ) : null}
      </div>

      <div className={styles.controls}>
        <button className={styles.stepBtn} onClick={() => step(-0.5)} aria-label="Decrease">−</button>
        <input
          type="number"
          className={styles.servingsInput}
          value={inputVal}
          placeholder="0"
          min={0}
          step={0.25}
          onChange={e => setInputVal(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(inputVal) }}
          aria-label="Servings"
        />
        <button className={styles.stepBtn} onClick={() => step(0.5)} aria-label="Increase">+</button>
        {onDelete && (
          <button className={styles.deleteBtn} onClick={onDelete} aria-label="Remove">✕</button>
        )}
      </div>
    </div>
  )
}
