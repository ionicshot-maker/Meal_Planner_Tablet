import { useState, useEffect, useRef } from 'react'
import { Button, Input } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientUnit, Macros } from '@/types'
import styles from './GeminiTab.module.css'

interface GeminiNutrition {
  calories: number
  protein: number
  carbs: number
  fiber: number
  sugar: number
  fat: number
  sodium: number
  servingSize?: number
  servingUnit?: string
  category?: string
}

function matchCategory(geminiCategory: string | undefined, userCategories: string[], fallback: string): string {
  if (!geminiCategory) return fallback
  const normalized = geminiCategory.trim().toLowerCase()
  const found = userCategories.find(c => c.toLowerCase() === normalized)
  return found ?? fallback
}

function geminiToIngredient(
  productName: string,
  brand: string,
  nutrition: GeminiNutrition,
  defaultCategory: string,
  userCategories: string[]
): Ingredient {
  const variantId = newId()
  const ingredientId = newId()
  const servingSize = nutrition.servingSize ?? 100
  const servingUnit = (nutrition.servingUnit ?? 'g') as IngredientUnit
  const category = matchCategory(nutrition.category, userCategories, defaultCategory)

  const macros: Macros = {
    calories: nutrition.calories ?? 0,
    protein: nutrition.protein ?? 0,
    carbs: nutrition.carbs ?? 0,
    fiber: nutrition.fiber ?? 0,
    sugar: nutrition.sugar ?? 0,
    fat: nutrition.fat ?? 0,
    sodium: nutrition.sodium ?? 0,
  }

  return {
    id: ingredientId,
    name: productName,
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
      brand: brand.trim(),   // user-typed brand, empty if not provided
      defaultUnit: servingUnit,
      servingSize,
      servingUnit,
      macros,
    }],
  }
}

interface Props {
  onReview: (draft: Ingredient) => void
  initialQuery?: string
}

export function GeminiTab({ onReview, initialQuery }: Props) {
  const { settings } = useSettings()
  const [productName, setProductName] = useState(initialQuery ?? '')
  const [brand, setBrand] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const didAutoLookup = useRef(false)

  const userCategories = settings.ingredientCategories
  const defaultCategory = userCategories[0] ?? 'Pantry'
  const hasKey = Boolean(settings.geminiApiKey)

  // Auto-trigger lookup when the tab is opened with a pre-filled name from the recipe editor
  useEffect(() => {
    if (initialQuery?.trim() && hasKey && !didAutoLookup.current) {
      didAutoLookup.current = true
      handleLookup()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLookup() {
    if (!productName.trim() || !hasKey) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/gemini-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: productName.trim(),
          brand: brand.trim(),
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel || 'gemini-2.5-flash',
        }),
      })
      const json = await res.json() as { status: number; nutrition?: GeminiNutrition; error?: string }
      if (!res.ok || json.status !== 1 || !json.nutrition) {
        setError(json.error ?? 'No nutrition data found for this product. Try a different name.')
        return
      }
      const draft = geminiToIngredient(productName.trim(), brand.trim(), json.nutrition, defaultCategory, userCategories)
      onReview(draft)
    } catch (err) {
      setError(`Request failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  if (!hasKey) {
    return (
      <div className={styles.tab}>
        <div className={styles.noKeyMsg}>
          <p className={styles.noKeyTitle}>Gemini API Key Required</p>
          <p className={styles.noKeyDesc}>
            Add a free Google Gemini API key in <strong>Settings → Integrations → Google Gemini</strong> to
            use AI-powered nutrition lookup. Gemini is especially useful for packaged products and branded foods.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.tab}>
      <p className={styles.desc}>
        Enter a product or ingredient name. Gemini AI will return nutrition facts based on the product label.
        Best for packaged foods and branded products. For whole foods, try the USDA tab.
      </p>

      <div className={styles.fields}>
        <Input
          label="Product Name *"
          value={productName}
          onChange={e => setProductName(e.target.value)}
          placeholder="e.g. McCormick Ground Cinnamon"
          onKeyDown={e => { if (e.key === 'Enter') handleLookup() }}
        />
        <Input
          label="Brand (optional)"
          value={brand}
          onChange={e => setBrand(e.target.value)}
          placeholder="e.g. McCormick"
        />
      </div>

      <Button
        onClick={handleLookup}
        disabled={loading || !productName.trim()}
      >
        {loading ? 'Getting nutrition…' : 'Look Up with Gemini'}
      </Button>

      {error && (
        <div className={styles.errorBox}>
          <p className={styles.error}>{error}</p>
          <button className={styles.retryBtn} onClick={handleLookup} disabled={loading || !productName.trim()}>
            Try Again
          </button>
        </div>
      )}

      <p className={styles.hint}>
        Powered by Google Gemini AI — verify values against the product label before saving.
      </p>
    </div>
  )
}
