import { useEffect, useRef, useState } from 'react'
import type { MealPlanDay, Person, Recipe, Ingredient } from '@/types'
import { DayTile } from './DayTile'
import { addDays, getWeekStart, parseDateLocal, toISODate, isToday } from '@/utils/mealPlanUtils'
import styles from './MobileDayStrip.module.css'

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  weekStart: Date
  dayMap: Map<string, MealPlanDay>
  recipes: Map<string, Recipe>
  paydayMap: Map<string, Person[]>
  ingredientMap: Map<string, Ingredient>
  watchedAllergens: string[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onNavigateWeek: (deltaWeeks: number) => void
}

/**
 * Compact mobile-portrait calendar: a Mon–Sun day-selector row plus a
 * 3-day window of DayTiles centered on the focused day, with left/right
 * swipe to shift the focus by one day (crossing into the next/previous
 * week automatically re-requests that week's data from the parent).
 * Replaces the full 7-day CalendarGrid, which is too cramped under
 * ~430px; the full grid remains available in landscape / wider layouts.
 */
export function MobileDayStrip({
  weekStart, dayMap, recipes, paydayMap, ingredientMap, watchedAllergens, selectedDate, onSelectDate, onNavigateWeek,
}: Props) {
  const weekStartISO = toISODate(weekStart)

  function defaultFocusFor(startISO: string): string {
    const todayISO = toISODate(new Date())
    return toISODate(getWeekStart(parseDateLocal(todayISO))) === startISO ? todayISO : startISO
  }

  const [focusDate, setFocusDate] = useState(() => defaultFocusFor(weekStartISO))
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // When the parent's loaded week changes (Today / prev / next / swipe crossing
  // a week boundary), re-anchor the focus to stay inside the newly-loaded range.
  useEffect(() => {
    setFocusDate(prev => {
      const prevWeekStartISO = toISODate(getWeekStart(parseDateLocal(prev)))
      if (prevWeekStartISO === weekStartISO) return prev
      return defaultFocusFor(weekStartISO)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO])

  const weekDates = Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)))
  const windowDates = [-1, 0, 1].map(offset => toISODate(addDays(parseDateLocal(focusDate), offset)))

  function shiftFocus(delta: number) {
    const next = toISODate(addDays(parseDateLocal(focusDate), delta))
    const nextWeekStartISO = toISODate(getWeekStart(parseDateLocal(next)))
    if (nextWeekStartISO !== weekStartISO) {
      onNavigateWeek(next < weekStartISO ? -1 : 1)
    }
    setFocusDate(next)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    // Require a clearly horizontal, deliberate drag so vertical scrolling
    // and taps aren't mistaken for a swipe.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    // A recognized swipe shouldn't also fire the browser's synthetic click
    // on whatever DayTile happens to sit under the finger at touchend.
    e.preventDefault()
    shiftFocus(dx < 0 ? 1 : -1)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.daySelector} role="tablist" aria-label="Select a day">
        {weekDates.map((date, i) => (
          <button
            key={date}
            type="button"
            role="tab"
            aria-selected={date === focusDate}
            className={`${styles.dayBtn} ${date === focusDate ? styles.dayBtnActive : ''} ${isToday(date) ? styles.dayBtnToday : ''}`}
            onClick={() => setFocusDate(date)}
          >
            <span className={styles.dayName}>{DOW_SHORT[i]}</span>
            <span className={styles.dayNum}>{parseDateLocal(date).getDate()}</span>
          </button>
        ))}
      </div>

      <div
        className={styles.tileRow}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {windowDates.map(date => (
          <DayTile
            key={date}
            date={date}
            day={dayMap.get(date)}
            recipes={recipes}
            paydays={paydayMap.get(date)}
            ingredientMap={ingredientMap}
            watchedAllergens={watchedAllergens}
            isSelected={selectedDate === date}
            onSelect={() => onSelectDate(date)}
          />
        ))}
      </div>

      <p className={styles.swipeHint}>‹ swipe to change day ›</p>
    </div>
  )
}
