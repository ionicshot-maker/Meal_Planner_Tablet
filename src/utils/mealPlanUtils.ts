import type { DayMeals, MealPlanDay, MealSlotItem, Person, Recipe, PayFrequency } from '@/types'

export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function parseDateLocal(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}

export function isToday(iso: string): boolean {
  return iso === toISODate(new Date())
}

export function formatDayLabel(iso: string): string {
  const d = parseDateLocal(iso)
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${names[d.getDay()]} ${d.getDate()}`
}

export function formatMonthRange(startISO: string, endISO: string): string {
  const s = parseDateLocal(startISO)
  const e = parseDateLocal(endISO)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const sStr = `${months[s.getMonth()]} ${s.getDate()}`
  const eStr = `${months[e.getMonth()]} ${e.getDate()}`
  if (s.getFullYear() !== e.getFullYear()) {
    return `${sStr} ${s.getFullYear()} – ${eStr} ${e.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth()) {
    return `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
  }
  return `${sStr} – ${eStr}, ${e.getFullYear()}`
}

export function getDateRange(weekStart: Date, numWeeks: number): string[] {
  const dates: string[] = []
  for (let i = 0; i < numWeeks * 7; i++) {
    dates.push(toISODate(addDays(weekStart, i)))
  }
  return dates
}

function computeIntervalPaydays(
  frequency: Extract<PayFrequency, 'weekly' | 'biweekly'>,
  nextPayday: string,
  start: Date,
  end: Date
): string[] {
  const interval = frequency === 'weekly' ? 7 : 14
  let anchor = parseDateLocal(nextPayday)
  let safety = 0
  while (anchor >= start && safety++ < 500) {
    anchor = addDays(anchor, -interval)
  }
  const result: string[] = []
  safety = 0
  let cur = addDays(anchor, interval)
  while (cur <= end && safety++ < 500) {
    if (cur >= start) result.push(toISODate(cur))
    cur = addDays(cur, interval)
  }
  return result
}

export function getPaydaysInRange(
  people: Person[],
  startISO: string,
  endISO: string
): Map<string, Person[]> {
  const map = new Map<string, Person[]>()
  const start = parseDateLocal(startISO)
  const end = parseDateLocal(endISO)

  for (const person of people) {
    if (!person.paydaySchedule) continue
    const { frequency, nextPayday } = person.paydaySchedule
    const paydays: string[] = []

    if (frequency === 'weekly' || frequency === 'biweekly') {
      paydays.push(...computeIntervalPaydays(frequency, nextPayday, start, end))
    } else if (frequency === 'semi-monthly') {
      const cur = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0)
      let safety = 0
      while (cur <= end && safety++ < 60) {
        for (const day of [1, 15]) {
          const d = new Date(cur.getFullYear(), cur.getMonth(), day, 12, 0, 0, 0)
          if (d >= start && d <= end) paydays.push(toISODate(d))
        }
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (frequency === 'monthly') {
      const anchor = parseDateLocal(nextPayday)
      const dayOfMonth = anchor.getDate()
      const cur = new Date(start.getFullYear(), start.getMonth(), dayOfMonth, 12, 0, 0, 0)
      if (cur < start) cur.setMonth(cur.getMonth() + 1)
      let safety = 0
      while (cur <= end && safety++ < 60) {
        paydays.push(toISODate(cur))
        cur.setMonth(cur.getMonth() + 1)
      }
    }

    for (const iso of paydays) {
      if (!map.has(iso)) map.set(iso, [])
      map.get(iso)!.push(person)
    }
  }

  return map
}

export function blankDayMeals(): DayMeals {
  return { breakfast: [], lunch: [], dinner: [], snacks: [] }
}

export function calcDayCost(day: MealPlanDay, recipes: Map<string, Recipe>): number | null {
  let total = 0
  let hasAny = false
  for (const slot of [day.meals.breakfast, day.meals.lunch, day.meals.dinner, day.meals.snacks]) {
    for (const item of slot) {
      if (item.recipeId) {
        const r = recipes.get(item.recipeId)
        if (r?.estimatedCostPerServing != null) {
          total += r.estimatedCostPerServing
          hasAny = true
        }
      }
    }
  }
  return hasAny ? total : null
}

export function calcDayTime(day: MealPlanDay, recipes: Map<string, Recipe>): number {
  const counted = new Set<string>()
  let total = 0
  for (const slot of [day.meals.breakfast, day.meals.lunch, day.meals.dinner, day.meals.snacks]) {
    for (const item of slot) {
      if (item.recipeId && !counted.has(item.recipeId)) {
        counted.add(item.recipeId)
        const r = recipes.get(item.recipeId)
        if (r) total += r.prepTimeMinutes + r.cookTimeMinutes
      }
    }
  }
  return total
}

export function hasMissingMeals(day: MealPlanDay): boolean {
  return (
    day.meals.breakfast.length === 0 ||
    day.meals.lunch.length === 0 ||
    day.meals.dinner.length === 0
  )
}

export function getItemLabel(item: MealSlotItem, recipes: Map<string, Recipe>): string {
  if (item.manualLabel) return item.manualLabel
  if (item.isLeftover) return item.manualLabel ? item.manualLabel : 'Leftover'
  if (item.recipeId) {
    const r = recipes.get(item.recipeId)
    if (r) return r.name
  }
  return '—'
}
