import { useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { PhotoCaptureCrop } from '@/components/PhotoCaptureCrop'
import { newId, now } from '@/utils/ids'
import { normalizeUnit } from '@/utils/recipeCalculations'
import type { Ingredient, Macros } from '@/types'
import styles from './ScanLabelTab.module.css'

interface LabelNutrition {
  productName?: string | null
  brand?: string | null
  servingSize?: number | null
  servingUnit?: string | null
  servingsPerContainer?: number | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fiber?: number | null
  sugar?: number | null
  fat?: number | null
  saturatedFat?: number | null
  transFat?: number | null
  sodium?: number | null
}

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fiber', 'sugar', 'fat', 'sodium'] as const

function labelScanToIngredient(
  nutrition: LabelNutrition,
  defaultCategory: string
): { ingredient: Ingredient; uncertainFields: Set<string> } {
  const uncertain = new Set<string>()
  if (!nutrition.productName) uncertain.add('name')
  if (nutrition.servingSize == null) uncertain.add('servingSize')
  for (const key of MACRO_KEYS) {
    if (nutrition[key] == null) uncertain.add(key)
  }

  const variantId = newId()
  const ingredientId = newId()
  const servingSize = nutrition.servingSize ?? 1
  const servingUnit = normalizeUnit(nutrition.servingUnit ?? 'g')

  const macros: Macros = {
    calories: nutrition.calories ?? 0,
    protein: nutrition.protein ?? 0,
    carbs: nutrition.carbs ?? 0,
    fiber: nutrition.fiber ?? 0,
    sugar: nutrition.sugar ?? 0,
    fat: nutrition.fat ?? 0,
    sodium: nutrition.sodium ?? 0,
    saturatedFat: nutrition.saturatedFat ?? undefined,
    transFat: nutrition.transFat ?? undefined,
  }

  const ingredient: Ingredient = {
    id: ingredientId,
    name: nutrition.productName?.trim() || '',
    category: defaultCategory,
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
      brand: nutrition.brand?.trim() || 'Generic',
      defaultUnit: servingUnit,
      servingSize,
      servingUnit,
      macros,
      totalServingsInPackage: nutrition.servingsPerContainer ?? undefined,
    }],
  }

  return { ingredient, uncertainFields: uncertain }
}

function blankIngredient(defaultCategory: string): Ingredient {
  const variantId = newId()
  const ingredientId = newId()
  return {
    id: ingredientId,
    name: '',
    category: defaultCategory,
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
      brand: 'Generic',
      defaultUnit: 'g',
      servingSize: 100,
      servingUnit: 'g',
      macros: { calories: 0, protein: 0, carbs: 0, fiber: 0, sugar: 0, fat: 0, sodium: 0 },
    }],
  }
}

const TIPS = [
  'Crop tightly to just the nutrition facts panel for best results',
  'Make sure the label is flat and not curved or wrinkled',
  'Good lighting with no glare on the label surface',
  'Hold the camera straight on, not at an angle',
  'If the label is too small, try zooming in before scanning',
]

type Stage = 'capture' | 'lowConfidence'

interface Notice { level: 'success' | 'warning'; message: string }

interface Props {
  onReview: (draft: Ingredient, uncertainFields: Set<string>, notice: Notice) => void
}

export function ScanLabelTab({ onReview }: Props) {
  const { settings } = useSettings()
  const [stage, setStage] = useState<Stage>('capture')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lowConfidenceReason, setLowConfidenceReason] = useState('')

  const hasKey = Boolean(settings.geminiApiKey)
  const userCategories = settings.ingredientCategories
  const defaultCategory = userCategories[0] ?? 'Pantry'

  async function handlePhotoCaptured(dataUrl: string) {
    setError('')
    setLoading(true)
    try {
      const commaIdx = dataUrl.indexOf(',')
      const base64 = dataUrl.slice(commaIdx + 1)
      const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:(.*);base64/)
      const mimeType = mimeMatch?.[1] || 'image/jpeg'

      const res = await fetch('/api/gemini-label-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mimeType,
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel || 'gemini-3.1-flash-lite',
        }),
      })
      const json = await res.json() as {
        status?: number; nutrition?: LabelNutrition; lowConfidence?: boolean; reason?: string; error?: string
      }

      if (!res.ok || json.error) {
        setError(json.error ?? 'Could not read the nutrition label. Try again.')
        return
      }
      if (json.lowConfidence || !json.nutrition) {
        setLowConfidenceReason(json.reason ?? 'The label was unclear.')
        setStage('lowConfidence')
        return
      }

      const { ingredient, uncertainFields } = labelScanToIngredient(json.nutrition, defaultCategory)
      const notice: Notice = uncertainFields.size === 0
        ? { level: 'success', message: 'Label scanned successfully — please verify before saving.' }
        : { level: 'warning', message: 'Some values could not be read — please verify highlighted fields against the label before saving.' }
      onReview(ingredient, uncertainFields, notice)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the nutrition label. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function resetScan() {
    setStage('capture')
    setLowConfidenceReason('')
    setError('')
  }

  function handleEnterManually() {
    onReview(blankIngredient(defaultCategory), new Set(), {
      level: 'warning',
      message: 'Enter the nutrition values manually from the label.',
    })
  }

  if (!hasKey) {
    return (
      <div className={styles.tab}>
        <div className={styles.noKeyMsg}>
          <p className={styles.noKeyTitle}>Gemini API Key Required</p>
          <p className={styles.noKeyDesc}>
            Add a free Google Gemini API key in <strong>Settings → Integrations → Google Gemini</strong> to
            scan nutrition labels — Gemini reads the photo and extracts the nutrition facts for you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.tab}>
      {stage === 'capture' && (
        <>
          <p className={styles.desc}>
            Take or upload a photo of a nutrition facts label. Crop tightly to just the nutrition
            facts panel for the best read — handy for packaging with several products on it.
          </p>
          <PhotoCaptureCrop
            primaryLabel="Take Photo or Scan Label"
            tipsTitle="📸 Tips for scanning nutrition labels:"
            tips={TIPS}
            onComplete={handlePhotoCaptured}
          />
          {error && (
            <div className={styles.errorBox}>
              <p className={styles.error}>{error}</p>
            </div>
          )}
          {loading && (
            <div className={styles.scanningOverlay}>
              <div className={styles.spinner} />
              <p className={styles.scanningText}>Reading nutrition label…</p>
            </div>
          )}
        </>
      )}

      {stage === 'lowConfidence' && (
        <div className={styles.lowConfidenceBox}>
          <p className={styles.lowConfidenceTitle}>
            ⚠️ We could not read this nutrition label clearly.
          </p>
          <p className={styles.lowConfidenceBody}>
            Try cropping tighter to just the nutrition facts panel, or make sure the label is well
            lit and in focus.
          </p>
          {lowConfidenceReason && (
            <p className={styles.lowConfidenceReason}>Gemini said: "{lowConfidenceReason}"</p>
          )}
          <div className={styles.lowConfidenceActions}>
            <button type="button" className={styles.btnCancel} onClick={resetScan}>
              Try Again
            </button>
            <button type="button" className={styles.btnImport} onClick={handleEnterManually}>
              Enter Manually
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
