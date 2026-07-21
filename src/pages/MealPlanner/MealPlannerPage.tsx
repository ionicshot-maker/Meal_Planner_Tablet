import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAllRecipes } from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { buildIngredientMap } from '@/utils/recipeCalculations'
import {
  getMealPlanDays,
  saveMealPlanDay,
  getAllMealPlanTemplates,
  saveMealPlanTemplate,
  deleteMealPlanTemplate,
  getActiveGroceryListsInRange,
  getPlannedDayCount,
} from '@/db/mealPlan'
import { useSettings, useHouseholdTitle } from '@/context/SettingsContext'
import type { Recipe, MealPlanDay, MealPlanWeekTemplate, Ingredient } from '@/types'
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
import { MobileDayStrip } from './MobileDayStrip'
import { DayDetail } from './DayDetail'
import { TemplateModal } from './TemplateModal'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './MealPlannerPage.module.css'

// Matches the app-wide "compact mobile header" breakpoint — below this the
// full 7-day grid can't fit legibly in portrait, so we switch to a 3-day
// swipeable strip instead. Landscape / wider screens keep the full grid.
const MOBILE_BREAKPOINT = '(max-width: 430px)'

function useIsMobilePortrait(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_BREAKPOINT).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return matches
}

export default function MealPlannerPage() {
  const { settings } = useSettings()
  const pageTitle = useHouseholdTitle('Meal Planner')
  const isMobilePortrait = useIsMobilePortrait()
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const [numWeeks, setNumWeeks] = useState(2)
  const [dayMap, setDayMap] = useState<Map<string, MealPlanDay>>(new Map())
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map())
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [templates, setTemplates] = useState<MealPlanWeekTemplate[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [staleGroceryWarning, setStaleGroceryWarning] = useState(false)
  // Global count across the whole local plan, not just the visible week(s) —
  // dayMap only holds whatever range is currently on screen.
  const [plannedDayCount, setPlannedDayCount] = useState<number | null>(null)

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
    getAllIngredients(false).then(setAllIngredients)
  }, [])

  const ingredientMap = useMemo(() => buildIngredientMap(allIngredients), [allIngredients])
  const watchedAllergens = settings.allergenWatchList ?? []

  // Load day plans when range changes
  useEffect(() => {
    getMealPlanDays(dateRange).then(setDayMap)
  }, [dateRange])

  useEffect(() => {
    getPlannedDayCount().then(setPlannedDayCount)
  }, [dayMap])

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
    setWeekStart(prev => addDays(prev, -7 * (isMobilePortrait ? 1 : numWeeks)))
  }

  function handleNextPeriod() {
    setWeekStart(prev => addDays(prev, 7 * (isMobilePortrait ? 1 : numWeeks)))
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
          <div className={styles.headingGroup}>
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
            {plannedDayCount !== null && (
              <p className={styles.countIndicator}>{plannedDayCount} {plannedDayCount === 1 ? 'day' : 'days'} planned</p>
            )}
          </div>
          <button className={styles.todayBtn} onClick={handleToday}>Today</button>
          <button className={styles.navBtn} onClick={handlePrevPeriod} aria-label="Previous">‹</button>
          <button className={styles.navBtn} onClick={handleNextPeriod} aria-label="Next">›</button>
          <span className={styles.monthRange}>{monthRange}</span>
        </div>

        <div className={styles.toolbarRight}>
          {!isMobilePortrait && (
            <div className={styles.weekPicker}>
              {([1, 2, 3, 4] as const).map(n => (
                <button
                  key={n}
                  className={`${styles.weekBtn} ${numWeeks === n ? styles.weekBtnActive : ''}`}
                  onClick={() => setNumWeeks(n)}
                >{n}w</button>
              ))}
            </div>
          )}
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
          {isMobilePortrait ? (
            <MobileDayStrip
              weekStart={weekStart}
              dayMap={dayMap}
              recipes={recipes}
              paydayMap={paydayMap}
              ingredientMap={ingredientMap}
              watchedAllergens={watchedAllergens}
              selectedDate={selectedDate}
              onSelectDate={date => setSelectedDate(prev => prev === date ? null : date)}
              onNavigateWeek={delta => setWeekStart(prev => addDays(prev, 7 * delta))}
            />
          ) : (
            <CalendarGrid
              dateRange={dateRange}
              dayMap={dayMap}
              recipes={recipes}
              paydayMap={paydayMap}
              ingredientMap={ingredientMap}
              watchedAllergens={watchedAllergens}
              selectedDate={selectedDate}
              onSelectDate={date => setSelectedDate(prev => prev === date ? null : date)}
            />
          )}
        </div>

        {selectedDate && selectedDay && (
          <div className={styles.detailArea}>
            <DayDetail
              key={selectedDate}
              date={selectedDate}
              day={selectedDay}
              recipes={recipes}
              allRecipes={allRecipes}
              ingredientMap={ingredientMap}
              watchedAllergens={watchedAllergens}
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
