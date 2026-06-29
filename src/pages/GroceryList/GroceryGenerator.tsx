import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getMealPlanDays } from '@/db/mealPlan'
import { getAllRecipes } from '@/db/recipes'
import { getAllIngredients } from '@/db/ingredients'
import { buildIngredientMap } from '@/utils/recipeCalculations'
import { consolidateIngredients, aggToGroceryItem } from '@/utils/groceryUtils'
import { toISODate } from '@/utils/mealPlanUtils'
import type { GroceryList, GroceryItem } from '@/types'
import type { AggregatedItem } from '@/utils/groceryUtils'
import styles from './GroceryGenerator.module.css'

interface Props {
  onGenerated: (list: GroceryList) => void
  onClose: () => void
}

type Step = 'dates' | 'aoh' | 'generating'

export function GroceryGenerator({ onGenerated, onClose }: Props) {
  const today = toISODate(new Date())
  const [step, setStep] = useState<Step>('dates')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [error, setError] = useState('')

  // Results from analysis
  const [allAggregated, setAllAggregated] = useState<AggregatedItem[]>([])
  const [aohItems, setAohItems] = useState<AggregatedItem[]>([])
  // Track which AoH items the user says they DON'T have (should be added to list)
  const [aohMissing, setAohMissing] = useState<Set<string>>(new Set())
  const [aohAnswered, setAohAnswered] = useState(false)

  // Close on Escape
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

    // Build date array
    const dates: string[] = []
    const cur = new Date(startDate + 'T12:00:00')
    const end = new Date(endDate + 'T12:00:00')
    while (cur <= end) {
      dates.push(toISODate(cur))
      cur.setDate(cur.getDate() + 1)
    }

    const [dayMap, recipes, ingredients] = await Promise.all([
      getMealPlanDays(dates),
      getAllRecipes(false),
      getAllIngredients(false),
    ])

    const recipeMap = new Map(recipes.map(r => [r.id, r]))
    const ingredientMap = buildIngredientMap(ingredients)
    const days = dates.map(d => dayMap.get(d)).filter(Boolean) as ReturnType<typeof dayMap.get>[]

    const aggregated = consolidateIngredients(
      days.filter(d => d !== undefined) as NonNullable<typeof days[number]>[],
      recipeMap,
      ingredientMap
    )

    const aoh = aggregated.filter(a => a.alwaysOnHand)
    setAllAggregated(aggregated)
    setAohItems(aoh)

    if (aoh.length > 0) {
      setStep('aoh')
    } else {
      generateList(aggregated, new Set())
    }
  }

  function handleAohYesAll() {
    // All on hand → none added to list
    generateList(allAggregated, new Set())
  }

  function handleAohConfirm() {
    generateList(allAggregated, aohMissing)
  }

  function toggleAohMissing(key: string) {
    setAohMissing(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function generateList(aggregated: AggregatedItem[], missingAohKeys: Set<string>) {
    const items: GroceryItem[] = aggregated
      .filter(a => {
        if (!a.alwaysOnHand) return true
        const key = `${a.ingredientId}::${a.variantId ?? ''}::${a.unit}`
        return missingAohKeys.has(key)
      })
      .map(aggToGroceryItem)

    const list: GroceryList = {
      id: crypto.randomUUID(),
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      items,
      manualItems: [],
      remainderItems: [],
      status: 'active',
    }
    onGenerated(list)
  }

  const nonAohCount = allAggregated.filter(a => !a.alwaysOnHand).length
  const aohCount = aohItems.length

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Generate Shopping List</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {(step === 'dates' || step === 'generating') && (
            <>
              <div className={styles.stepTitle}>Select shopping window</div>
              <div className={styles.dateRow}>
                <label className={styles.dateField}>
                  <span>From</span>
                  <input type="date" className={styles.dateInput} value={startDate}
                    onChange={e => setStartDate(e.target.value)} />
                </label>
                <span className={styles.dateSep}>→</span>
                <label className={styles.dateField}>
                  <span>To</span>
                  <input type="date" className={styles.dateInput} value={endDate}
                    onChange={e => setEndDate(e.target.value)} />
                </label>
              </div>
              {error && <div className={styles.error}>{error}</div>}
              {step === 'generating' && (
                <div className={styles.loadingMsg}>Analyzing your meal plan…</div>
              )}
            </>
          )}

          {step === 'aoh' && (
            <>
              <div className={styles.stepTitle}>Always-on-hand check</div>
              <p className={styles.aohDesc}>
                The following {aohCount} ingredient{aohCount !== 1 ? 's are' : ' is'} marked as
                <strong> Always On Hand</strong> in your database.
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
                  <button className={styles.btnPrimary} onClick={handleAohConfirm}>
                    Continue with {aohMissing.size > 0 ? `${aohMissing.size} added` : 'no additions'}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {step === 'dates' && (
          <div className={styles.footer}>
            <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button className={styles.btnPrimary} onClick={handleAnalyze}>
              Analyze Plan
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
