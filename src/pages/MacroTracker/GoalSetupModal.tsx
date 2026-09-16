import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import { ConfirmDiscardDialog } from '@/components/ui'
import { useConfirmClose } from '@/hooks/useConfirmClose'
import { getEntriesForRange } from '@/db/macroLogs'
import { toISODate } from '@/utils/mealPlanUtils'
import type { NutrientGoals, NutrientToggles, MacroLogEntry } from '@/types'
import { nutrientLabel, nutrientUnit, STANDARD_NUTRIENTS, calculateTDEE, checkWeightStaleness } from '@/utils/macroUtils'
import type { NutrientKey } from '@/utils/macroUtils'
import type { Person } from '@/types'
import styles from './GoalSetupModal.module.css'

// Plain-language, always-visible disclaimer - a locked product requirement.
// Never dismissible, never hidden behind a tooltip/expand, shown every time
// a calculated result is displayed, not just on first use.
const TDEE_DISCLAIMER = 'This is an estimate based on your profile (age, weight, height, sex, and activity level) using the Mifflin-St Jeor formula, a commonly used nutrition calculation. It is not medical advice — consult a healthcare provider for personalized guidance.'

// Mirrors calculateTDEE()'s own null-guard field-by-field (src/utils/macroUtils.ts)
// so the two never drift apart - if that guard's conditions ever change, this
// list should change with it.
function getMissingProfileFields(person: Person): string[] {
  const missing: string[] = []
  if (person.age == null || person.age <= 0) missing.push('age')
  if (person.weight == null || person.weight <= 0) missing.push('weight')
  if (person.height == null || person.height <= 0) missing.push('height')
  if (person.sex == null) missing.push('sex')
  if (person.activityLevel == null) missing.push('activity level')
  return missing
}

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

  const initialMethodRef = useRef(method)
  const initialGoalsRef = useRef(JSON.stringify(goals))
  const isDirty = method !== initialMethodRef.current || JSON.stringify(goals) !== initialGoalsRef.current
  const { confirming, requestClose, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  // "Calculate for me" state — purely a display/pre-fill assistant; nothing
  // here is written to person.goals until the modal's existing Save action
  // is clicked, same as every other field in this modal.
  const [recentLogs, setRecentLogs] = useState<MacroLogEntry[]>([])
  const [tdeeResult, setTdeeResult] = useState<{ bmr: number; tdee: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const end = toISODate(new Date())
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - settings.macroHistoryDays)
      const logs = await getEntriesForRange(personId, toISODate(startDate), end)
      if (!cancelled) setRecentLogs(logs)
    }
    load()
    return () => { cancelled = true }
  }, [personId, settings.macroHistoryDays])

  if (!person) return null

  const staleness = tdeeResult ? checkWeightStaleness(person, recentLogs) : null
  const missingFields = getMissingProfileFields(person)

  function handleCalculateForMe() {
    const result = calculateTDEE(person!)
    setTdeeResult(result)
    if (result) setField('totalCalories', String(result.tdee))
  }

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
    <>
    <div className={styles.overlay} onClick={requestClose}>
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
              <div className={styles.calcAssist}>
                <button
                  type="button"
                  className={styles.calcBtn}
                  onClick={handleCalculateForMe}
                  disabled={missingFields.length > 0}
                >
                  Calculate for me (estimated from your profile)
                </button>

                {missingFields.length > 0 && (
                  <p className={styles.calcMissingChip}>
                    ⚠️ Missing {missingFields.join(', ')} for {person.name} — add these in Settings → Household → People Profiles to use this.
                  </p>
                )}

                {tdeeResult && (
                  <div className={styles.calcPanel}>
                    <p className={styles.calcHeadline}>Suggested target: {tdeeResult.tdee} kcal/day</p>
                    <p className={styles.calcSecondary}>
                      Estimated BMR: {tdeeResult.bmr} kcal · TDEE (maintenance): {tdeeResult.tdee} kcal
                    </p>
                    {staleness?.isStale && staleness.loggedWeight != null && staleness.driftLbs != null && (
                      <p className={styles.calcStaleness}>
                        Your most recently logged weight ({staleness.loggedWeight} lbs on {staleness.loggedDate}) differs from your profile weight ({staleness.profileWeight} lbs) by {Math.abs(staleness.driftLbs)} lbs — consider updating your profile for a more accurate estimate.
                      </p>
                    )}
                    <p className={styles.calcDisclaimer}>{TDEE_DISCLAIMER}</p>
                  </div>
                )}
              </div>

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
    </div>
    <ConfirmDiscardDialog open={confirming} onKeepEditing={cancelDiscard} onDiscard={confirmDiscard} />
    </>,
    document.body
  )
}
