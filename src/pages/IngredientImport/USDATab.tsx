import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientUnit, Macros } from '@/types'
import styles from './USDATab.module.css'

interface USDAFood {
  fdcId: number
  description: string
  dataType: string
  brandOwner?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients: { nutrientId: number; value: number }[]
}

function getNutrient(food: USDAFood, id: number): number {
  return food.foodNutrients.find(n => n.nutrientId === id)?.value ?? 0
}

function r1(n: number): number { return Math.round(n * 10) / 10 }

function usdaToIngredient(food: USDAFood, category: string): Ingredient {
  // USDA SR Legacy / Foundation nutrients are per 100 g.
  // Scale to actual serving size if one is provided.
  const servingG = food.servingSize ?? 100
  const scale    = servingG > 0 ? servingG / 100 : 1

  const macros: Macros = {
    calories:     r1(getNutrient(food, 1008) * scale),
    protein:      r1(getNutrient(food, 1003) * scale),
    carbs:        r1(getNutrient(food, 1005) * scale),
    fiber:        r1(getNutrient(food, 1079) * scale),
    sugar:        r1(getNutrient(food, 2000) * scale),
    fat:          r1(getNutrient(food, 1004) * scale),
    sodium:       r1(getNutrient(food, 1093) * scale),
    saturatedFat: getNutrient(food, 1258) * scale || undefined,
    transFat:     getNutrient(food, 1257) * scale || undefined,
  }

  const variantId   = newId()
  const ingredientId = newId()
  const brand = food.brandOwner || 'Generic'
  const unit  = (food.servingSizeUnit?.toLowerCase() ?? 'g') as IngredientUnit

  return {
    id: ingredientId,
    name: food.description,
    category,
    perishable: false,
    frozen: false,
    alwaysOnHand: false,
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    defaultVariantId: variantId,
    variants: [{
      id: variantId,
      parentId: ingredientId,
      brand,
      defaultUnit: unit,
      servingSize: servingG,
      servingUnit: unit,
      macros,
      usdaFdcId: food.fdcId,
    }],
  }
}

interface SearchGroup {
  query: string
  results: USDAFood[]
  selectedIdx: number | null
}

interface Props {
  onReview: (draft: Ingredient) => void
  initialQuery?: string
}

export function USDATab({ onReview, initialQuery }: Props) {
  const { settings } = useSettings()
  const [namesInput, setNamesInput] = useState(initialQuery ?? '')

  useEffect(() => {
    if (initialQuery) setNamesInput(initialQuery)
  }, [initialQuery])
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const defaultCategory = settings.ingredientCategories[0] ?? 'Pantry'

  async function handleSearch() {
    const names = namesInput.split('\n').map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setSearching(true)
    setError('')
    setGroups([])
    setCurrentGroupIdx(0)

    const key = settings.usdaApiKey || 'DEMO_KEY'
    const results: SearchGroup[] = []

    for (const query of names) {
      try {
        const res = await fetch(`/api/usda-search?query=${encodeURIComponent(query)}&apiKey=${encodeURIComponent(key)}`)
        const json = await res.json() as { foods?: USDAFood[] }
        results.push({ query, results: json.foods ?? [], selectedIdx: null })
      } catch {
        results.push({ query, results: [], selectedIdx: null })
      }
    }

    setGroups(results)
    setSearching(false)
  }

  function selectResult(groupIdx: number, foodIdx: number) {
    const group = groups[groupIdx]
    const food = group.results[foodIdx]
    const draft = usdaToIngredient(food, defaultCategory)
    onReview(draft)
  }

  function skipGroup() {
    setCurrentGroupIdx(i => Math.min(i + 1, groups.length - 1))
  }

  const activeGroup = groups[currentGroupIdx]

  return (
    <div className={styles.tab}>
      {groups.length === 0 ? (
        <>
          <p className={styles.desc}>
            Enter ingredient names (one per line). The top 5 USDA results for each will appear
            so you can pick the best match and auto-fill macros.
            Best for raw ingredients like produce, meat, and grains. For packaged products, try the Gemini Lookup tab.
          </p>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={'Chicken Breast\nBrown Rice\nOlive Oil'}
            value={namesInput}
            onChange={e => setNamesInput(e.target.value)}
            rows={6}
          />
          <div className={styles.actions}>
            <Button onClick={handleSearch} disabled={searching || !namesInput.trim()}>
              {searching ? 'Searching…' : 'Search USDA'}
            </Button>
            {settings.usdaApiKey === '' && (
              <p className={styles.hint}>
                Using the public demo key — rate-limited. Add your key in Settings → Integrations.
              </p>
            )}
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </>
      ) : (
        <div className={styles.resultsArea}>
          <div className={styles.progress}>
            {groups.map((g, i) => (
              <button
                key={i}
                className={`${styles.progressDot} ${i === currentGroupIdx ? styles.dotActive : ''} ${i < currentGroupIdx ? styles.dotDone : ''}`}
                onClick={() => setCurrentGroupIdx(i)}
                title={g.query}
              />
            ))}
            <span className={styles.progressLabel}>
              {currentGroupIdx + 1} / {groups.length}
            </span>
          </div>

          {activeGroup && (
            <>
              <h3 className={styles.queryTitle}>"{activeGroup.query}"</h3>

              {activeGroup.results.length === 0 ? (
                <p className={styles.noResults}>No USDA results found for this name.</p>
              ) : (
                <div className={styles.resultList}>
                  {activeGroup.results.map((food, idx) => (
                    <button
                      key={food.fdcId}
                      className={styles.resultCard}
                      onClick={() => selectResult(currentGroupIdx, idx)}
                    >
                      <div className={styles.resultName}>{food.description}</div>
                      <div className={styles.resultMeta}>
                        <span>{getNutrient(food, 1008)} kcal</span>
                        <span>{getNutrient(food, 1003).toFixed(1)}g protein</span>
                        <span>{getNutrient(food, 1005).toFixed(1)}g carbs</span>
                        <span>{getNutrient(food, 1004).toFixed(1)}g fat</span>
                        <span className={styles.dataType}>{food.dataType}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.groupActions}>
                <Button variant="ghost" size="sm" onClick={() => { setGroups([]); setNamesInput('') }}>
                  ← New Search
                </Button>
                {currentGroupIdx < groups.length - 1 && (
                  <Button variant="secondary" size="sm" onClick={skipGroup}>
                    Skip →
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
