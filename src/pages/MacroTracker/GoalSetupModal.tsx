import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import type { NutrientGoals, NutrientToggles } from '@/types'
import { nutrientLabel, nutrientUnit, STANDARD_NUTRIENTS } from '@/utils/macroUtils'
import type { NutrientKey } from '@/utils/macroUtils'
import styles from './GoalSetupModal.module.css'

interface Props {
  personId: string
  nutrientToggles: NutrientToggles
  onClose: () => void
}

export function GoalSetupModal({ personId, nutrientToggles, onClose }: Props) {
  const { settings, updateSettings } = useSettings()
  const person = settings.people.find(p => p.id === personId)
  const [method, setMethod] = useState<'individual' | 'percentage'>(person?.goalMethod ?? 'individual')
  const [goals, setGoals]   = useState<NutrientGoals>(person?.goals ?? {})

  if (!person) return null

  const activeOptional: NutrientKey[] = []
  if (nutrientToggles.saturatedFat) activeOptional.push('saturatedFat')
  if (nutrientToggles.transFat)     activeOptional.push('transFat')
  if (nutrientToggles.alcohol)      activeOptional.push('alcohol')

  function setField(key: keyof NutrientGoals, raw: string) {
    const v = parseFloat(raw) || undefined
    setGoals(prev => ({ ...prev, [key]: v }))
  }

  function numField(key: keyof NutrientGoals, label: string, unit: string, step = 1) {
    return (
      <div key={key} className={styles.field}>
        <label className={styles.fieldLabel}>
          {label} <span className={styles.unit}>({unit})</span>
        </label>
        <input
          type="number" className={styles.fieldInput}
          min={0} step={step}
          value={goals[key] ?? ''}
          placeholder="—"
          onChange={e => setField(key, e.target.value)}
        />
      </div>
    )
  }

  // Computed grams from percentages
  const cal = goals.totalCalories ?? 0
  const computedProtein = goals.proteinPct ? Math.round(cal * goals.proteinPct / 100 / 4) : null
  const computedCarbs   = goals.carbsPct   ? Math.round(cal * goals.carbsPct   / 100 / 4) : null
  const computedFat     = goals.fatPct     ? Math.round(cal * goals.fatPct     / 100 / 9) : null

  async function handleSave() {
    const updated = settings.people.map(p =>
      p.id === personId ? { ...p, goalMethod: method, goals } : p
    )
    await updateSettings({ people: updated })
    onClose()
  }

  async function handleClear() {
    const updated = settings.people.map(p =>
      p.id === personId ? { ...p, goalMethod: undefined, goals: undefined } : p
    )
    await updateSettings({ people: updated })
    onClose()
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Set Goals — {person.name}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Method selector */}
          <div className={styles.methodRow}>
            <button
              className={`${styles.methodBtn} ${method === 'individual' ? styles.methodBtnActive : ''}`}
              onClick={() => setMethod('individual')}
            >
              <span className={styles.methodTitle}>Individual Targets</span>
              <span className={styles.methodDesc}>Set a specific value for each nutrient</span>
            </button>
            <button
              className={`${styles.methodBtn} ${method === 'percentage' ? styles.methodBtnActive : ''}`}
              onClick={() => setMethod('percentage')}
            >
              <span className={styles.methodTitle}>Calorie + %</span>
              <span className={styles.methodDesc}>Set total calories and macro percentages</span>
            </button>
          </div>

          {method === 'individual' && (
            <div className={styles.fieldsGrid}>
              {STANDARD_NUTRIENTS.map(key =>
                numField(key, nutrientLabel(key), nutrientUnit(key), key === 'sodium' ? 50 : 1)
              )}
              {activeOptional.map(key =>
                numField(key, nutrientLabel(key), nutrientUnit(key))
              )}
            </div>
          )}

          {method === 'percentage' && (
            <div className={styles.pctSection}>
              <div className={styles.fieldsGrid}>
                {numField('totalCalories', 'Total Calories', 'kcal', 50)}

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Protein %</label>
                  <input
                    type="number" className={styles.fieldInput} min={0} max={100} step={1}
                    value={goals.proteinPct ?? ''} placeholder="—"
                    onChange={e => setField('proteinPct', e.target.value)}
                  />
                  {computedProtein != null && <span className={styles.computed}>≈ {computedProtein}g</span>}
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Carbs %</label>
                  <input
                    type="number" className={styles.fieldInput} min={0} max={100} step={1}
                    value={goals.carbsPct ?? ''} placeholder="—"
                    onChange={e => setField('carbsPct', e.target.value)}
                  />
                  {computedCarbs != null && <span className={styles.computed}>≈ {computedCarbs}g</span>}
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Fat %</label>
                  <input
                    type="number" className={styles.fieldInput} min={0} max={100} step={1}
                    value={goals.fatPct ?? ''} placeholder="—"
                    onChange={e => setField('fatPct', e.target.value)}
                  />
                  {computedFat != null && <span className={styles.computed}>≈ {computedFat}g</span>}
                </div>
              </div>

              <div className={styles.divider}><span>Individual targets for remaining nutrients</span></div>

              <div className={styles.fieldsGrid}>
                {numField('fiber',   'Fiber',   'g')}
                {numField('sugar',   'Sugar',   'g')}
                {numField('sodium',  'Sodium',  'mg', 50)}
                {activeOptional.map(key => numField(key, nutrientLabel(key), nutrientUnit(key)))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.clearBtn} onClick={handleClear}>Clear Goals</button>
          <div className={styles.footerRight}>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button className={styles.btnPrimary} onClick={handleSave}>Save Goals</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
