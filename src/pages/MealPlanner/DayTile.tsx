import type { MealPlanDay, Person, Recipe } from '@/types'
import { formatDayLabel, isToday, calcDayCost, calcDayTime, hasMissingMeals, getItemLabel } from '@/utils/mealPlanUtils'
import { formatMinutes } from '@/utils/units'
import styles from './DayTile.module.css'

interface Props {
  date: string
  day?: MealPlanDay
  recipes: Map<string, Recipe>
  paydays?: Person[]
  isSelected: boolean
  onSelect: () => void
}

export function DayTile({ date, day, recipes, paydays, isSelected, onSelect }: Props) {
  const today = isToday(date)
  const label = formatDayLabel(date)
  const missing = day ? hasMissingMeals(day) : true
  const cost = day ? calcDayCost(day, recipes) : null
  const totalTime = day ? calcDayTime(day, recipes) : 0
  const hasContent = day &&
    (day.meals.breakfast.length + day.meals.lunch.length + day.meals.dinner.length + day.meals.snacks.length) > 0

  // Show amber warning on the header when there's content but some slots are empty
  const showAmberHeader = missing && !!hasContent

  const mealSummary: string[] = []
  if (day) {
    for (const slot of [day.meals.breakfast, day.meals.lunch, day.meals.dinner, day.meals.snacks]) {
      for (const item of slot.slice(0, 1)) {
        const lbl = getItemLabel(item, recipes)
        if (lbl && lbl !== '—') mealSummary.push(lbl)
      }
    }
  }

  return (
    <button
      className={`${styles.tile} ${today ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
      onClick={onSelect}
    >
      <div className={`${styles.tileHeader} ${showAmberHeader ? styles.tileHeaderAmber : ''}`}>
        <span className={styles.label}>{label}</span>
        <div className={styles.icons}>
          {paydays && paydays.length > 0 && paydays.map(p => (
            <span
              key={p.id}
              className={styles.paydayIcon}
              style={{ color: p.paydaySchedule?.color ?? '#27AE60' }}
              title={`${p.name}'s payday`}
            >$</span>
          ))}
        </div>
      </div>

      <div className={styles.mealList}>
        {mealSummary.length > 0
          ? mealSummary.map((name, i) => (
              <div key={i} className={styles.mealLine}>{name}</div>
            ))
          : <div className={styles.emptyDay}>No meals planned</div>
        }
      </div>

      {(cost != null || totalTime > 0) && (
        <div className={styles.tileMeta}>
          {totalTime > 0 && <span>{formatMinutes(totalTime)}</span>}
          {cost != null && <span>${cost.toFixed(2)}</span>}
        </div>
      )}
    </button>
  )
}
