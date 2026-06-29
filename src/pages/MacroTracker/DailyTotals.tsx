import type { MacroLogEntry, Person, NutrientToggles } from '@/types'
import { sumEntries, resolveGoals, getActiveNutrients, nutrientLabel, formatNutrient } from '@/utils/macroUtils'
import type { NutrientKey } from '@/utils/macroUtils'
import styles from './DailyTotals.module.css'

interface Props {
  entries: MacroLogEntry[]
  person: Person
  nutrientToggles: NutrientToggles
  date: string
  onSetGoals: () => void
}

export function DailyTotals({ entries, person, nutrientToggles, date, onSetGoals }: Props) {
  const totals = sumEntries(entries)
  const goals  = resolveGoals(person)
  const nutrients = getActiveNutrients(nutrientToggles)
  const isComplex = person.mode === 'complex'

  function pct(key: NutrientKey): number {
    const g = goals?.[key]
    const v = totals[key] ?? 0
    if (!g || g <= 0) return 0
    return Math.min(100, Math.round((v / g) * 100))
  }

  function barColor(p: number): string {
    if (p >= 100) return 'var(--color-danger)'
    if (p >= 85)  return 'var(--color-success)'
    return 'var(--color-accent)'
  }

  function printDailySummary() {
    const w = window.open('', '_blank')
    if (!w) return
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const rows = nutrients.map(key => {
      const val = totals[key]
      const goal = goals?.[key]
      const p = pct(key)
      return `<tr>
        <td>${nutrientLabel(key)}</td>
        <td class="num">${formatNutrient(val, key)}</td>
        ${goal ? `<td class="num">${formatNutrient(goal, key)}</td><td class="num">${p}%</td>` : '<td colspan="2" class="muted">—</td>'}
      </tr>`
    }).join('')
    const waterEntry = entries.find(e => e.mealSlot === '__water__')
    const waterRow = (person.trackWater && waterEntry?.waterOz)
      ? `<tr><td>Water</td><td class="num">${waterEntry.waterOz} oz</td><td colspan="2" class="muted">—</td></tr>`
      : ''
    const weightEntry = entries.find(e => e.mealSlot === '__weight__')
    const weightRow = (person.mode === 'complex' && person.trackWeight && weightEntry?.weightLbs)
      ? `<tr><td>Weight</td><td class="num">${weightEntry.weightLbs} lbs</td><td colspan="2" class="muted">—</td></tr>`
      : ''

    w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Macro Summary — ${person.name} — ${dateLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111;padding:24px;max-width:600px;margin:0 auto}
  h1{font-size:16pt;font-weight:bold;margin-bottom:4px}
  .sub{font-size:10pt;color:#666;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:10.5pt}
  th{text-align:left;padding:6px 8px;font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:2px solid #ddd}
  th.num,td.num{text-align:right}
  td{padding:5px 8px;border-bottom:1px solid #eee}
  td.muted{color:#aaa;text-align:right}
  tr:last-child td{border-bottom:none}
  @media print{body{padding:12px}}
</style></head><body>
<h1>${person.name}</h1>
<div class="sub">${dateLabel}</div>
<table>
  <thead><tr>
    <th>Nutrient</th>
    <th class="num">Consumed</th>
    <th class="num">Goal</th>
    <th class="num">%</th>
  </tr></thead>
  <tbody>${rows}${waterRow}${weightRow}</tbody>
</table>
</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 200)
  }

  return (
    <div className={styles.totals}>
      <div className={styles.totalsHeader}>
        <span className={styles.totalsTitle}>Daily Totals</span>
        <div className={styles.totalsActions}>
          <button className={styles.printBtn} onClick={printDailySummary} title="Print daily summary">
            🖨
          </button>
          {isComplex && (
            <button className={styles.goalsBtn} onClick={onSetGoals}>
              {goals ? '✏ Goals' : '+ Set Goals'}
            </button>
          )}
        </div>
      </div>

      <div className={styles.nutrientGrid}>
        {nutrients.map(key => {
          const val = totals[key]
          const goal = goals?.[key]
          const p = pct(key)
          return (
            <div key={key} className={styles.nutrientRow}>
              <span className={styles.nutrientName}>{nutrientLabel(key)}</span>

              {isComplex && goals ? (
                <div className={styles.progressWrapper}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${p}%`, background: barColor(p) }}
                    />
                  </div>
                  <div className={styles.progressLabels}>
                    <span className={styles.consumed}>{formatNutrient(val, key)}</span>
                    <span className={styles.goal}>/ {formatNutrient(goal, key)}</span>
                    <span className={styles.pct}>{p}%</span>
                  </div>
                </div>
              ) : (
                <span className={styles.simpleVal}>{formatNutrient(val, key)}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Water summary */}
      {person.trackWater && (() => {
        const waterEntry = entries.find(e => e.mealSlot === '__water__')
        return waterEntry?.waterOz ? (
          <div className={styles.waterRow}>
            <span className={styles.nutrientName}>💧 Water</span>
            <span className={styles.simpleVal}>{waterEntry.waterOz} oz</span>
          </div>
        ) : null
      })()}
    </div>
  )
}
