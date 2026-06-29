import type { MealPlanDay, Person, Recipe } from '@/types'
import { DayTile } from './DayTile'
import styles from './CalendarGrid.module.css'

const DOW_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  dateRange: string[]
  dayMap: Map<string, MealPlanDay>
  recipes: Map<string, Recipe>
  paydayMap: Map<string, Person[]>
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

export function CalendarGrid({ dateRange, dayMap, recipes, paydayMap, selectedDate, onSelectDate }: Props) {
  const numWeeks = dateRange.length / 7

  return (
    <div className={styles.grid}>
      {/* Day-of-week headers */}
      <div className={styles.headerRow}>
        {DOW_HEADERS.map(h => (
          <div key={h} className={styles.dowHeader}>{h}</div>
        ))}
      </div>

      {/* Week rows */}
      {Array.from({ length: numWeeks }, (_, w) => (
        <div key={w} className={styles.weekRow}>
          {dateRange.slice(w * 7, w * 7 + 7).map(date => (
            <DayTile
              key={date}
              date={date}
              day={dayMap.get(date)}
              recipes={recipes}
              paydays={paydayMap.get(date)}
              isSelected={selectedDate === date}
              onSelect={() => onSelectDate(date)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
