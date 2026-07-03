import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAllRecipes } from '@/db/recipes'
import {
  getMealPlanDays,
  saveMealPlanDay,
  getAllMealPlanTemplates,
  saveMealPlanTemplate,
  deleteMealPlanTemplate,
  getActiveGroceryListsInRange,
} from '@/db/mealPlan'
import { useSettings, useHouseholdTitle } from '@/context/SettingsContext'
import type { Recipe, MealPlanDay, MealPlanWeekTemplate } from '@/types'
import {
  getWeekStart,
  addDays,
  toISODate,
  getDateRange,
  getPaydaysInRange,
  formatMonthRange,
  blankDayMeals,
  parseDateLocal,
} from '@/utils/mealPlanUtils'
import { CalendarGrid } from './CalendarGrid'
import { DayDetail } from './DayDetail'
import { TemplateModal } from './TemplateModal'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './MealPlannerPage.module.css'

export default function MealPlannerPage() {
  const { settings } = useSettings()
  const pageTitle = useHouseholdTitle('Meal Planner')
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [numWeeks, setNumWeeks] = useState(2)
  const [dayMap, setDayMap] = useState<Map<string, MealPlanDay>>(new Map())
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map())
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [templates, setTemplates] = useState<MealPlanWeekTemplate[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [staleGroceryWarning, setStaleGroceryWarning] = useState(false)

  const dateRange = useMemo(
    () => getDateRange(weekStart, numWeeks),
    [weekStart, numWeeks]
  )

  const paydayMap = useMemo(
    () => dateRange.length > 0
      ? getPaydaysInRange(settings.people, dateRange[0], dateRange[dateRange.length - 1])
      : new Map(),
    [settings.people, dateRange]
  )

  // Load recipes once
  useEffect(() => {
    getAllRecipes(false).then(list => {
      const m = new Map<string, Recipe>()
      for (const r of list) m.set(r.id, r)
      setRecipes(m)
      setAllRecipes(list)
    })
    getAllMealPlanTemplates().then(setTemplates)
  }, [])

  // Load day plans when range changes
  useEffect(() => {
    getMealPlanDays(dateRange).then(setDayMap)
  }, [dateRange])

  // Check for stale grocery lists when day map changes
  useEffect(() => {
    if (dateRange.length === 0) return
    getActiveGroceryListsInRange(dateRange[0], dateRange[dateRange.length - 1])
      .then(lists => setStaleGroceryWarning(lists.length > 0))
  }, [dayMap, dateRange])

  const getOrBlankDay = useCallback((date: string): MealPlanDay =>
    dayMap.get(date) ?? { date, meals: blankDayMeals() },
    [dayMap]
  )

  const handleDayUpdate = useCallback(async (day: MealPlanDay) => {
    await saveMealPlanDay(day)
    setDayMap(prev => new Map(prev).set(day.date, day))
    setStaleGroceryWarning(false) // will re-check via effect
  }, [])

  function handlePrevPeriod() {
    setWeekStart(prev => addDays(prev, -7 * numWeeks))
  }

  function handleNextPeriod() {
    setWeekStart(prev => addDays(prev, 7 * numWeeks))
  }

  function handleToday() {
    const today = toISODate(new Date())
    setWeekStart(getWeekStart(new Date()))
    setSelectedDate(today)
  }

  async function handleSaveTemplate(name: string) {
    const template: MealPlanWeekTemplate = {
      id: crypto.randomUUID(),
      name,
      days: dateRange.map(d => getOrBlankDay(d)),
      createdAt: new Date().toISOString(),
    }
    await saveMealPlanTemplate(template)
    setTemplates(prev => [...prev, template])
  }

  async function handleApplyTemplate(template: MealPlanWeekTemplate) {
    for (let i = 0; i < Math.min(template.days.length, dateRange.length); i++) {
      const srcDay = template.days[i]
      const targetDate = dateRange[i]
      const newDay: MealPlanDay = { date: targetDate, meals: srcDay.meals }
      await saveMealPlanDay(newDay)
      setDayMap(prev => new Map(prev).set(targetDate, newDay))
    }
  }

  async function handleCopyWeek(targetWeekStartISO: string) {
    const targetStart = parseDateLocal(targetWeekStartISO)
    for (let i = 0; i < dateRange.length; i++) {
      const srcDay = getOrBlankDay(dateRange[i])
      const targetDate = toISODate(addDays(targetStart, i))
      const newDay: MealPlanDay = { date: targetDate, meals: srcDay.meals }
      await saveMealPlanDay(newDay)
      // If the target is in the current view, update map
      if (dayMap.has(targetDate) || dateRange.includes(targetDate)) {
        setDayMap(prev => new Map(prev).set(targetDate, newDay))
      }
    }
  }

  async function handleDeleteTemplate(id: string) {
    await deleteMealPlanTemplate(id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const monthRange = dateRange.length > 0
    ? formatMonthRange(dateRange[0], dateRange[dateRange.length - 1])
    : ''

  const selectedDay = selectedDate ? getOrBlankDay(selectedDate) : null

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.pageTitle}>{pageTitle}</h1>
          <button className={styles.todayBtn} onClick={handleToday}>Today</button>
          <button className={styles.navBtn} onClick={handlePrevPeriod} aria-label="Previous">‹</button>
          <button className={styles.navBtn} onClick={handleNextPeriod} aria-label="Next">›</button>
          <span className={styles.monthRange}>{monthRange}</span>
        </div>

        <div className={styles.toolbarRight}>
          <div className={styles.weekPicker}>
            {([1, 2, 3, 4] as const).map(n => (
              <button
                key={n}
                className={`${styles.weekBtn} ${numWeeks === n ? styles.weekBtnActive : ''}`}
                onClick={() => setNumWeeks(n)}
              >{n}w</button>
            ))}
          </div>
          <button className={styles.templateBtn} onClick={() => setShowTemplateModal(true)}>
            Templates
          </button>
          <PageHelpButton />
        </div>
      </div>

      {/* Color legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} />
          Amber header = one or more meals not yet planned
        </span>
      </div>

      {/* Stale grocery warning */}
      {staleGroceryWarning && (
        <div className={styles.staleWarning}>
          Your grocery list may be outdated after meal plan changes.
          <button className={styles.staleClose} onClick={() => setStaleGroceryWarning(false)}>Dismiss</button>
        </div>
      )}

      {/* Body: calendar + day detail */}
      <div className={styles.body}>
        <div className={styles.calendarArea}>
          <CalendarGrid
            dateRange={dateRange}
            dayMap={dayMap}
            recipes={recipes}
            paydayMap={paydayMap}
            selectedDate={selectedDate}
            onSelectDate={date => setSelectedDate(prev => prev === date ? null : date)}
          />
        </div>

        {selectedDate && selectedDay && (
          <div className={styles.detailArea}>
            <DayDetail
              key={selectedDate}
              date={selectedDate}
              day={selectedDay}
              recipes={recipes}
              allRecipes={allRecipes}
              onUpdate={handleDayUpdate}
              onClose={() => setSelectedDate(null)}
            />
          </div>
        )}
      </div>

      {showTemplateModal && (
        <TemplateModal
          templates={templates}
          currentWeekDays={dateRange.map(getOrBlankDay)}
          weekStart={weekStart}
          onSave={handleSaveTemplate}
          onApply={handleApplyTemplate}
          onDelete={handleDeleteTemplate}
          onCopyWeek={handleCopyWeek}
          onClose={() => setShowTemplateModal(false)}
        />
      )}
    </div>
  )
}
