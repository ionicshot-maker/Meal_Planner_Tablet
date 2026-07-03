import { useEffect, useState } from 'react'
import { getMealPlanDays } from '@/db/mealPlan'
import { addDays, addMonths, dayHasAnyMeals, getWeekStart, parseDateLocal, toISODate } from '@/utils/mealPlanUtils'
import styles from './MealPlanCalendarPicker.module.css'

interface Props {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// A Monday-start grid of the given month: null cells before day 1 / after the
// last day so adjacent months' real dates never get duplicated between the
// two calendars shown side by side.
function getMonthCells(monthAnchor: Date): (string | null)[] {
  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()
  const firstOfMonth = new Date(year, month, 1, 12, 0, 0, 0)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = firstOfMonth.getDay() // 0=Sun..6=Sat
  const leadingBlanks = firstWeekday === 0 ? 6 : firstWeekday - 1

  const cells: (string | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toISODate(new Date(year, month, d, 12, 0, 0, 0)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function datesBetween(startISO: string, endISO: string): string[] {
  const dates: string[] = []
  let cur = parseDateLocal(startISO)
  const end = parseDateLocal(endISO)
  while (cur <= end) {
    dates.push(toISODate(cur))
    cur = addDays(cur, 1)
  }
  return dates
}

export function MealPlanCalendarPicker({ startDate, endDate, onChange }: Props) {
  const [today] = useState(() => new Date())
  const todayISO = toISODate(today)
  const baseMonth = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0)

  const [monthOffset, setMonthOffset] = useState(0)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [visibleMealDates, setVisibleMealDates] = useState<Set<string>>(new Set())
  const [rangeMealCount, setRangeMealCount] = useState(0)

  const month0 = addMonths(baseMonth, monthOffset)
  const month1 = addMonths(baseMonth, monthOffset + 1)

  // Dots for whichever two months are currently visible.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const dates = [...getMonthCells(month0), ...getMonthCells(month1)].filter((d): d is string => d !== null)
      const map = await getMealPlanDays(dates)
      if (cancelled) return
      const set = new Set<string>()
      for (const [date, day] of map) {
        if (dayHasAnyMeals(day)) set.add(date)
      }
      setVisibleMealDates(set)
    }
    load()
    return () => { cancelled = true }
  }, [monthOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Y with meals planned" needs the full selected range, which can span
  // further than whatever two months happen to be on screen.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!startDate || !endDate || startDate > endDate) { setRangeMealCount(0); return }
      const map = await getMealPlanDays(datesBetween(startDate, endDate))
      if (cancelled) return
      let count = 0
      for (const day of map.values()) if (dayHasAnyMeals(day)) count++
      setRangeMealCount(count)
    }
    load()
    return () => { cancelled = true }
  }, [startDate, endDate])

  function applyRange(start: Date, end: Date) {
    onChange(toISODate(start), toISODate(end))
    setPendingStart(null)
    const monthsDiff = (start.getFullYear() - baseMonth.getFullYear()) * 12 + (start.getMonth() - baseMonth.getMonth())
    setMonthOffset(Math.max(0, monthsDiff))
  }

  function selectThisWeek() {
    const start = getWeekStart(today)
    applyRange(start, addDays(start, 6))
  }
  function selectNextWeek() {
    const start = addDays(getWeekStart(today), 7)
    applyRange(start, addDays(start, 6))
  }
  function selectNext2Weeks() {
    applyRange(today, addDays(today, 13))
  }
  function selectThisMonth() {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12, 0, 0, 0)
    applyRange(today, end)
  }

  function handleDayClick(iso: string) {
    if (iso < todayISO) return
    if (!pendingStart) {
      setPendingStart(iso)
      onChange(iso, iso)
    } else {
      const s = pendingStart < iso ? pendingStart : iso
      const e = pendingStart < iso ? iso : pendingStart
      onChange(s, e)
      setPendingStart(null)
    }
  }

  const totalDaysSelected = startDate && endDate && startDate <= endDate
    ? Math.round((parseDateLocal(endDate).getTime() - parseDateLocal(startDate).getTime()) / 86400000) + 1
    : 0

  function renderMonth(monthDate: Date, secondary: boolean) {
    const cells = getMonthCells(monthDate)
    return (
      <div className={`${styles.month} ${secondary ? styles.monthSecondary : ''}`}>
        <div className={styles.monthLabel}>{MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}</div>
        <div className={styles.weekdayRow}>
          {WEEKDAY_LABELS.map(d => <span key={d} className={styles.weekdayLabel}>{d}</span>)}
        </div>
        <div className={styles.grid}>
          {cells.map((iso, i) => {
            if (!iso) return <span key={i} className={styles.dayBlank} />
            const isPast = iso < todayISO
            const isStart = iso === startDate
            const isEnd = iso === endDate
            const isEndpoint = isStart || isEnd
            const isInRange = Boolean(startDate && endDate && iso > startDate && iso < endDate)
            const hasMeals = visibleMealDates.has(iso)
            const isToday = iso === todayISO
            const dayNum = parseDateLocal(iso).getDate()
            const classes = [
              styles.day,
              isPast ? styles.dayPast : '',
              isInRange ? styles.dayInRange : '',
              isEndpoint ? styles.dayEndpoint : '',
              isToday && !isEndpoint ? styles.dayToday : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={iso}
                type="button"
                className={classes}
                disabled={isPast}
                onClick={() => handleDayClick(iso)}
                aria-label={iso}
                aria-pressed={isEndpoint}
              >
                <span className={styles.dayNum}>{dayNum}</span>
                {hasMeals && <span className={styles.dayDot} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.quickSelectRow}>
        <button type="button" className={styles.quickBtn} onClick={selectThisWeek}>This Week</button>
        <button type="button" className={styles.quickBtn} onClick={selectNextWeek}>Next Week</button>
        <button type="button" className={styles.quickBtn} onClick={selectNext2Weeks}>Next 2 Weeks</button>
        <button type="button" className={styles.quickBtn} onClick={selectThisMonth}>This Month</button>
      </div>

      <div className={styles.calendarNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setMonthOffset(o => Math.max(0, o - 1))}
          disabled={monthOffset === 0}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className={styles.navSpacer} />
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setMonthOffset(o => o + 1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className={styles.monthsRow}>
        {renderMonth(month0, false)}
        {renderMonth(month1, true)}
      </div>

      <p className={styles.summary}>
        {totalDaysSelected > 0
          ? `${totalDaysSelected} day${totalDaysSelected !== 1 ? 's' : ''} selected — ${rangeMealCount} day${rangeMealCount !== 1 ? 's' : ''} have meals planned`
          : 'No dates selected yet'}
      </p>
    </div>
  )
}
