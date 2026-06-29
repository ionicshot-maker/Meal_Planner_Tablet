import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { MacroLogEntry, Macros, NutrientToggles } from '@/types'
import { ZERO_MACROS, STANDARD_NUTRIENTS, nutrientLabel, nutrientUnit } from '@/utils/macroUtils'
import type { NutrientKey } from '@/utils/macroUtils'
import styles from './ManualLogModal.module.css'

const SLOT_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'dinner',    label: 'Dinner' },
  { value: 'snacks',    label: 'Snacks' },
  { value: 'other',     label: 'Other' },
]

interface Props {
  initialSlot: string
  date: string
  personId: string
  nutrientToggles: NutrientToggles
  onAdd: (entry: Omit<MacroLogEntry, 'id' | 'createdAt'>) => void
  onClose: () => void
}

export function ManualLogModal({ initialSlot, date, personId, nutrientToggles, onAdd, onClose }: Props) {
  const [label, setLabel]       = useState('')
  const [slot, setSlot]         = useState(initialSlot)
  const [servings, setServings] = useState('1')
  const [macros, setMacros]     = useState<Macros>({ ...ZERO_MACROS })

  const activeOptional: NutrientKey[] = []
  if (nutrientToggles.saturatedFat) activeOptional.push('saturatedFat')
  if (nutrientToggles.transFat)     activeOptional.push('transFat')
  if (nutrientToggles.alcohol)      activeOptional.push('alcohol')
  const allNutrients: NutrientKey[] = [...STANDARD_NUTRIENTS, ...activeOptional]

  function setMacroField(key: NutrientKey, raw: string) {
    const v = parseFloat(raw) || 0
    setMacros(prev => ({ ...prev, [key]: v }))
  }

  function handleSubmit() {
    if (!label.trim()) return
    const svgs = Math.max(0.25, parseFloat(servings) || 1)
    onAdd({
      date, personId,
      mealSlot: slot,
      label: label.trim(),
      servingsEaten: svgs,
      macros,
      isManual: true,
    })
    onClose()
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Add Manual Entry</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>Item name *</label>
            <input
              className={styles.input}
              placeholder="e.g. Burger, coffee, snack bar…"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Meal</label>
              <select className={styles.select} value={slot} onChange={e => setSlot(e.target.value)}>
                {SLOT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Servings</label>
              <input
                type="number" className={styles.input} min={0.25} step={0.25}
                value={servings} onChange={e => setServings(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.macrosSection}>
            <div className={styles.macrosTitle}>Per-Serving Nutrition</div>
            <div className={styles.macrosGrid}>
              {allNutrients.map(key => (
                <div key={key} className={styles.macroField}>
                  <label className={styles.macroLabel}>
                    {nutrientLabel(key)} <span className={styles.unit}>({nutrientUnit(key)})</span>
                  </label>
                  <input
                    type="number" className={styles.macroInput}
                    min={0} step={key === 'sodium' ? 1 : 0.1}
                    value={(macros[key] ?? 0) || ''}
                    placeholder="0"
                    onChange={e => setMacroField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={!label.trim()}>
            Add Entry
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
