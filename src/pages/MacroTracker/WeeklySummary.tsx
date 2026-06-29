import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getEntriesForRange } from '@/db/macroLogs'
import { sumEntries, resolveGoals, formatNutrient, ZERO_MACROS, addMacros } from '@/utils/macroUtils'
import { toISODate, parseDateLocal } from '@/utils/mealPlanUtils'
import type { Person, MacroLogEntry, NutrientToggles } from '@/types'
import type { NutrientKey } from '@/utils/macroUtils'
import styles from './WeeklySummary.module.css'

interface Props {
  person: Person
  currentDate: string
  nutrientToggles: NutrientToggles
  onClose: () => void
}

const COL_KEYS: NutrientKey[] = ['calories', 'protein', 'carbs', 'fat']

export function WeeklySummary({ person, currentDate, nutrientToggles: _nt, onClose }: Props) {
  const [allEntries, setAllEntries] = useState<MacroLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Build 7-day window ending on currentDate
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = parseDateLocal(currentDate)
    d.setDate(d.getDate() - i)
    days.push(toISODate(d))
  }
  const startDate = days[0]
  const endDate   = days[days.length - 1]

  useEffect(() => {
    setLoading(true)
    getEntriesForRange(person.id, startDate, endDate)
      .then(e => { setAllEntries(e); setLoading(false) })
  }, [person.id, startDate, endDate])

  const goals = resolveGoals(person)

  // Per-day totals
  const dayTotals = days.map(date => {
    const dayEntries = allEntries.filter(e => e.date === date)
    return { date, macros: sumEntries(dayEntries), hasData: dayEntries.some(e => e.mealSlot !== '__water__' && e.mealSlot !== '__weight__') }
  })

  // Weight entries per day (complex + trackWeight)
  const weightEntries = allEntries.filter(e => e.mealSlot === '__weight__' && e.weightLbs)
  const showWeight = person.mode === 'complex' && person.trackWeight && weightEntries.length > 0

  // Average
  const activeDays = dayTotals.filter(d => d.hasData)
  const avg = activeDays.length > 0
    ? activeDays.reduce((acc, d) => addMacros(acc, d.macros), { ...ZERO_MACROS })
    : { ...ZERO_MACROS }
  if (activeDays.length > 1) {
    COL_KEYS.forEach(k => {
      const v = avg[k] ?? 0
      ;(avg as Record<string, number>)[k] = Math.round((v / activeDays.length) * 10) / 10
    })
  }

  function fmtDate(iso: string) {
    return parseDateLocal(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
  }

  function fmtVal(macros: typeof ZERO_MACROS, key: NutrientKey) {
    const v = macros[key]
    return v != null && v > 0 ? formatNutrient(v, key) : '—'
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Weekly Summary — {person.name}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>Loading…</div>
          ) : (
            <>
              {/* Day table */}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Date</th>
                    {COL_KEYS.map(k => <th key={k} className={styles.th}>{k.charAt(0).toUpperCase() + k.slice(1)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dayTotals.map(({ date, macros, hasData }) => (
                    <tr key={date} className={`${styles.tr} ${date === currentDate ? styles.trToday : ''} ${!hasData ? styles.trEmpty : ''}`}>
                      <td className={styles.td}>{fmtDate(date)}</td>
                      {COL_KEYS.map(k => (
                        <td key={k} className={styles.td}>{hasData ? fmtVal(macros, k) : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {activeDays.length > 0 && (
                  <tfoot>
                    <tr className={styles.avgRow}>
                      <td className={styles.td}>
                        <strong>Avg{activeDays.length < 7 ? ` (${activeDays.length}d)` : ''}</strong>
                      </td>
                      {COL_KEYS.map(k => <td key={k} className={styles.td}><strong>{fmtVal(avg, k)}</strong></td>)}
                    </tr>
                    {goals && (
                      <tr className={styles.goalRow}>
                        <td className={styles.td}>Goal</td>
                        {COL_KEYS.map(k => <td key={k} className={styles.td}>{formatNutrient(goals[k], k)}</td>)}
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>

              {/* Weight history */}
              {showWeight && (
                <div className={styles.weightSection}>
                  <div className={styles.weightTitle}>⚖️ Weight Log</div>
                  <div className={styles.weightList}>
                    {weightEntries
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map(e => (
                        <div key={e.id} className={styles.weightRow}>
                          <span className={styles.weightDate}>{fmtDate(e.date)}</span>
                          <span className={styles.weightVal}>{e.weightLbs} lbs</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeDays.length === 0 && (
                <div className={styles.noData}>No data logged in this period yet.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
