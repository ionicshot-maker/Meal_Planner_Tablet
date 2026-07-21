import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getMealPlanDays } from '@/db/mealPlan'
import { getAllRecipes } from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { getAllHouseholdItems } from '@/db/householdItems'
import { buildIngredientMap } from '@/utils/recipeCalculations'
import { consolidateIngredients, aggToGroceryItem } from '@/utils/groceryUtils'
import { toISODate } from '@/utils/mealPlanUtils'
import { MealPlanCalendarPicker } from './MealPlanCalendarPicker'
import type { GroceryList, GroceryItem, HouseholdItem, IngredientUnit } from '@/types'
import type { AggregatedItem, UnresolvedIngredientRef } from '@/utils/groceryUtils'
import styles from './GroceryGenerator.module.css'

interface Props {
  onGenerated: (list: GroceryList) => void
  onClose: () => void
}

type Step = 'dates' | 'aoh' | 'generating'

function householdToGroceryItem(h: HouseholdItem): GroceryItem {
  return {
    id: crypto.randomUUID(),
    name: h.name,
    quantity: 1,
    unit: 'each' as IngredientUnit,
    category: h.category || 'Household Items',
    brand: h.brand || undefined,
    store: h.store || undefined,
    unitPrice: h.price,
    checked: false,
    partiallyBought: false,
    isManual: true,
  }
}

export function GroceryGenerator({ onGenerated, onClose }: Props) {
  const today = toISODate(new Date())
  const [step, setStep] = useState<Step>('dates')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [error, setError] = useState('')

  // Results from analysis
  const [allAggregated, setAllAggregated] = useState<AggregatedItem[]>([])
  const [aohItems, setAohItems] = useState<AggregatedItem[]>([])
  const [aohMissing, setAohMissing] = useState<Set<string>>(new Set())
  const [aohAnswered, setAohAnswered] = useState(false)

  // Household AoH items
  const [aohHouseholdItems, setAohHouseholdItems] = useState<HouseholdItem[]>([])
  const [aohHouseholdMissing, setAohHouseholdMissing] = useState<Set<string>>(new Set())

  // Ingredient lines that were dropped from this list because they couldn't be
  // resolved to an ingredient record — surfaced instead of silently vanishing.
  const [danglingRefs, setDanglingRefs] = useState<UnresolvedIngredientRef[]>([])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleAnalyze() {
    if (!startDate || !endDate || startDate > endDate) {
      setError('Please select a valid date range.')
      return
    }
    setError('')
    setStep('generating')

    const dates: string[] = []
    const cur = new Date(startDate + 'T12:00:00')
    const end = new Date(endDate + 'T12:00:00')
    while (cur <= end) {
      dates.push(toISODate(cur))
      cur.setDate(cur.getDate() + 1)
    }

    const [dayMap, recipes, ingredients, householdAll] = await Promise.all([
      getMealPlanDays(dates),
      getAllRecipes(false),
      getAllIngredients(false),
      getAllHouseholdItems(),
    ])

    const recipeMap = new Map(recipes.map(r => [r.id, r]))
    const ingredientMap = buildIngredientMap(ingredients)
    const days = dates.map(d => dayMap.get(d)).filter(Boolean) as ReturnType<typeof dayMap.get>[]

    const { items: aggregated, unresolved } = consolidateIngredients(
      days.filter(d => d !== undefined) as NonNullable<typeof days[number]>[],
      recipeMap,
      ingredientMap
    )
    const dangling = unresolved.filter(u => u.reason === 'dangling')
    setDanglingRefs(dangling)

    const aoh = aggregated.filter(a => a.alwaysOnHand)
    const aohHousehold = householdAll.filter(h => h.alwaysOnHand)

    setAllAggregated(aggregated)
    setAohItems(aoh)
    setAohHouseholdItems(aohHousehold)

    if (aoh.length > 0 || aohHousehold.length > 0 || dangling.length > 0) {
      setStep('aoh')
    } else {
      generateList(aggregated, new Set(), new Set())
    }
  }

  function handleAohYesAll() {
    generateList(allAggregated, new Set(), new Set())
  }

  function handleAohConfirm() {
    generateList(allAggregated, aohMissing, aohHouseholdMissing)
  }

  function toggleAohMissing(key: string) {
    setAohMissing(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAohHouseholdMissing(id: string) {
    setAohHouseholdMissing(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function generateList(aggregated: AggregatedItem[], missingAohKeys: Set<string>, missingHouseholdIds: Set<string>) {
    const ingredientItems: GroceryItem[] = aggregated
      .filter(a => {
        if (!a.alwaysOnHand) return true
        const key = `${a.ingredientId}::${a.variantId ?? ''}::${a.unit}`
        return missingAohKeys.has(key)
      })
      .map(aggToGroceryItem)

    const householdItems: GroceryItem[] = aohHouseholdItems
      .filter(h => missingHouseholdIds.has(h.id))
      .map(householdToGroceryItem)

    const list: GroceryList = {
      id: crypto.randomUUID(),
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      items: ingredientItems,
      manualItems: householdItems,
      remainderItems: [],
      status: 'active',
    }
    onGenerated(list)
  }

  const nonAohCount = allAggregated.filter(a => !a.alwaysOnHand).length
  const aohCount = aohItems.length
  const aohHouseholdCount = aohHouseholdItems.length

  const validRange = Boolean(startDate && endDate && startDate <= endDate)

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.panel} ${step !== 'aoh' ? styles.panelWide : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Generate Shopping List</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {(step === 'dates' || step === 'generating') && (
            <>
              <div className={styles.stepTitle}>Select shopping window</div>
              <MealPlanCalendarPicker
                startDate={startDate}
                endDate={endDate}
                onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
              />
              {error && <div className={styles.error}>{error}</div>}
              {step === 'generating' && (
                <div className={styles.loadingMsg}>Analyzing your meal plan…</div>
              )}
            </>
          )}

          {step === 'aoh' && (
            <>
              {danglingRefs.length > 0 && (
                <div className={styles.error} role="alert">
                  <strong>{danglingRefs.length} ingredient line{danglingRefs.length !== 1 ? 's' : ''} couldn't be added</strong> —
                  {' '}they reference an ingredient record that no longer exists (likely a sync data issue).
                  <ul>
                    {danglingRefs.slice(0, 8).map((u, i) => (
                      <li key={i}>{u.recipeName}: {u.ingredientName}</li>
                    ))}
                    {danglingRefs.length > 8 && <li>…and {danglingRefs.length - 8} more</li>}
                  </ul>
                  Try Settings → Cloud Sync → Sync Now, or edit the affected recipe(s) to relink the ingredient.
                </div>
              )}

              {(aohCount > 0 || aohHouseholdCount > 0) ? (
              <>
              <div className={styles.stepTitle}>Always-on-hand check</div>
              <p className={styles.aohDesc}>
                {aohCount > 0 && (
                  <>The following <strong>{aohCount} ingredient{aohCount !== 1 ? 's are' : ' is'}</strong> marked as Always On Hand. </>
                )}
                {aohHouseholdCount > 0 && (
                  <>Plus <strong>{aohHouseholdCount} household item{aohHouseholdCount !== 1 ? 's' : ''}</strong> usually kept on hand. </>
                )}
                The rest of your list has <strong>{nonAohCount} item{nonAohCount !== 1 ? 's' : ''}</strong>.
              </p>
              <p className={styles.aohQuestion}>Are you still stocked on all of these?</p>

              {!aohAnswered ? (
                <div className={styles.aohActions}>
                  <button className={styles.btnPrimary} onClick={handleAohYesAll}>
                    Yes — all stocked
                  </button>
                  <button className={styles.btnSecondary} onClick={() => setAohAnswered(true)}>
                    No — let me check each one
                  </button>
                </div>
              ) : (
                <>
                  <p className={styles.aohCheckNote}>Check any items you need to buy:</p>
                  {aohCount > 0 && (
                    <ul className={styles.aohList}>
                      {aohItems.map(item => {
                        const key = `${item.ingredientId}::${item.variantId ?? ''}::${item.unit}`
                        return (
                          <li key={key} className={styles.aohItem}>
                            <label className={styles.aohLabel}>
                              <input
                                type="checkbox"
                                className={styles.aohCheckbox}
                                checked={aohMissing.has(key)}
                                onChange={() => toggleAohMissing(key)}
                              />
                              <span className={styles.aohName}>{item.name}</span>
                              <span className={styles.aohQty}>
                                {Math.round(item.quantity * 100) / 100} {item.unit}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {aohHouseholdCount > 0 && (
                    <>
                      {aohCount > 0 && <div className={styles.aohDivider}>Household Items</div>}
                      <ul className={styles.aohList}>
                        {aohHouseholdItems.map(item => (
                          <li key={item.id} className={styles.aohItem}>
                            <label className={styles.aohLabel}>
                              <input
                                type="checkbox"
                                className={styles.aohCheckbox}
                                checked={aohHouseholdMissing.has(item.id)}
                                onChange={() => toggleAohHouseholdMissing(item.id)}
                              />
                              <span className={styles.aohName}>{item.name}</span>
                              <span className={styles.aohQty}>
                                {[item.brand, item.store ? `@ ${item.store}` : null].filter(Boolean).join(' ') || '1 each'}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <button className={styles.btnPrimary} onClick={handleAohConfirm}>
                    Continue with {aohMissing.size + aohHouseholdMissing.size > 0
                      ? `${aohMissing.size + aohHouseholdMissing.size} added`
                      : 'no additions'}
                  </button>
                </>
              )}
              </>
              ) : (
                <button className={styles.btnPrimary} onClick={handleAohYesAll}>
                  Continue
                </button>
              )}
            </>
          )}
        </div>

        {step === 'dates' && (
          <div className={styles.footer}>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button className={styles.btnPrimary} onClick={handleAnalyze} disabled={!validRange}>
              Analyze Plan
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
