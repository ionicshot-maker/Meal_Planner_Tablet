import { useState } from 'react'
import { useSettings, useHouseholdTitle } from '@/context/SettingsContext'
import { toISODate, parseDateLocal } from '@/utils/mealPlanUtils'
import { DayLog } from './DayLog'
import { WeeklySummary } from './WeeklySummary'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './MacroTrackerPage.module.css'

export default function MacroTrackerPage() {
  const { settings } = useSettings()
  const pageTitle = useHouseholdTitle('Macro Tracker')
  const { people, nutrientToggles, unitSystem } = settings

  const today = toISODate(new Date())
  const [selectedPersonId, setSelectedPersonId] = useState(() => people[0]?.id ?? '')
  const [date, setDate] = useState(today)
  const [showWeekly, setShowWeekly] = useState(false)

  const selectedPerson = people.find(p => p.id === selectedPersonId)

  function prevDay() {
    const d = parseDateLocal(date)
    d.setDate(d.getDate() - 1)
    setDate(toISODate(d))
  }
  function nextDay() {
    const d = parseDateLocal(date)
    d.setDate(d.getDate() + 1)
    setDate(toISODate(d))
  }
  function formatDateLabel(iso: string) {
    return parseDateLocal(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  }

  return (
    <div className={styles.page}>
      {/* Title row */}
      <div className={styles.titleRow}>
        <h1 className={styles.pageTitle}>{pageTitle}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {selectedPerson && (
            <button className={styles.weeklyBtn} onClick={() => setShowWeekly(true)}>
              📊 Weekly
            </button>
          )}
          <PageHelpButton />
        </div>
      </div>

      {/* Person tabs */}
      {people.length === 0 ? (
        <div className={styles.noPeople}>
          No people configured. Add profiles in <strong>Settings → Household</strong> to start tracking macros.
        </div>
      ) : (
        <div className={styles.personTabs}>
          {people.slice(0, 10).map(p => (
            <button
              key={p.id}
              className={`${styles.personTab} ${selectedPersonId === p.id ? styles.personTabActive : ''}`}
              onClick={() => setSelectedPersonId(p.id)}
            >
              <span className={styles.personTabName}>{p.name}</span>
              <span className={styles.personTabMode}>{p.mode}</span>
            </button>
          ))}
        </div>
      )}

      {/* Date navigation */}
      {selectedPerson && (
        <div className={styles.datebar}>
          <button className={styles.dateNavBtn} onClick={prevDay} aria-label="Previous day">‹</button>
          <span className={styles.dateLabel}>{formatDateLabel(date)}</span>
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            onChange={e => e.target.value && setDate(e.target.value)}
          />
          <button className={styles.dateNavBtn} onClick={nextDay} aria-label="Next day">›</button>
          {date !== today && (
            <button className={styles.todayBtn} onClick={() => setDate(today)}>Today</button>
          )}
        </div>
      )}

      {/* Main content */}
      <div className={styles.content}>
        {selectedPerson ? (
          <DayLog
            key={`${selectedPersonId}|${date}`}
            person={selectedPerson}
            date={date}
            nutrientToggles={nutrientToggles}
            unitSystem={unitSystem}
            householdSize={settings.householdSize}
          />
        ) : people.length > 0 ? (
          <div className={styles.noPeople}>Select a person above to view their macro log.</div>
        ) : null}
      </div>

      {showWeekly && selectedPerson && (
        <WeeklySummary
          person={selectedPerson}
          currentDate={date}
          nutrientToggles={nutrientToggles}
          onClose={() => setShowWeekly(false)}
        />
      )}
    </div>
  )
}
