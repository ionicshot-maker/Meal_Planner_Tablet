import { useState, useRef, useEffect, useCallback } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { Button, Input } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientUnit, Macros, NutritionSource } from '@/types'
import styles from './BarcodeTab.module.css'

const DEFAULT_CATEGORIES = [
  'Meat', 'Seafood', 'Dairy', 'Eggs', 'Produce', 'Frozen',
  'Pantry', 'Bakery', 'Condiments', 'Seasonings', 'Beverages',
  'Snacks', 'Canned Goods', 'Deli', 'Household',
]

// Seasonings is checked before Condiments — many spice products carry a "condiment" tag in OFF
function mapOFFCategoryToApp(offCategories: string[], appCategories: string[]): string {
  const tags = offCategories.map(t => t.toLowerCase())
  const checks: [string[], string][] = [
    [['meat', 'beef', 'pork', 'poultry', 'chicken', 'turkey'], 'Meat'],
    [['seafood', 'fish', 'shrimp', 'salmon', 'tuna'], 'Seafood'],
    [['dairy', 'milk', 'cheese', 'yogurt', 'butter', 'cream'], 'Dairy'],
    [['egg'], 'Eggs'],
    [['produce', 'vegetable', 'fruit', 'fresh'], 'Produce'],
    [['frozen'], 'Frozen'],
    [['bread', 'bakery', 'bagel', 'muffin', 'pastry', 'baked'], 'Bakery'],
    [['spice', 'seasoning', 'herb', 'cinnamon', 'garlic', 'paprika', 'cumin', 'turmeric',
      'oregano', 'basil', 'thyme', 'ginger', 'nutmeg', 'cloves', 'chili', 'cayenne',
      'salt', 'pepper', 'ground-spice'], 'Seasonings'],
    [['sauce', 'condiment', 'dressing', 'ketchup', 'mustard', 'mayo', 'salsa', 'vinegar', 'marinade'], 'Condiments'],
    [['beverage', 'drink', 'juice', 'soda', 'water', 'coffee', 'tea'], 'Beverages'],
    [['snack', 'chip', 'cracker', 'cookie', 'candy', 'chocolate'], 'Snacks'],
    [['canned', 'bean', 'soup', 'tomato'], 'Canned Goods'],
    [['deli', 'cold cut', 'lunch meat'], 'Deli'],
  ]
  for (const [keywords, cat] of checks) {
    if (keywords.some(k => tags.some(t => t.includes(k)))) {
      if (appCategories.includes(cat)) return cat
    }
  }
  return appCategories[0] ?? 'Pantry'
}

// Shape returned by the barcode-lookup Netlify function
interface NormalizedProduct {
  product_name: string
  brands: string
  categories_tags: string[]
  serving_display_size: number
  serving_display_unit: string
  serving_quantity_g: number
  macros: Macros
}

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
}

function isMacrosIncomplete(macros: Macros): boolean {
  return (macros.calories ?? 0) === 0
      && (macros.protein  ?? 0) === 0
      && (macros.carbs    ?? 0) === 0
      && (macros.fat      ?? 0) === 0
}

function normalizedToIngredient(product: NormalizedProduct, categories: string[]): Ingredient {
  const variantId    = newId()
  const ingredientId = newId()
  const brand    = product.brands.split(',')[0].trim() || 'Generic'
  const category = mapOFFCategoryToApp(product.categories_tags, categories)
  const unit     = product.serving_display_unit as IngredientUnit

  return {
    id: ingredientId,
    name: product.product_name || 'Unknown Product',
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
      servingSize: product.serving_display_size,
      servingUnit: unit,
      macros: product.macros,
    }],
  }
}

interface Props {
  onReview: (draft: Ingredient, source: NutritionSource) => void
}

export function BarcodeTab({ onReview }: Props) {
  const { settings } = useSettings()
  const [manualBarcode, setManualBarcode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const categories = settings.ingredientCategories.length > 0
    ? settings.ingredientCategories
    : DEFAULT_CATEGORIES

  const stopScanner = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop()
      controlsRef.current = null
    }
    setScanning(false)
  }, [])

  useEffect(() => () => stopScanner(), [stopScanner])

  async function startScanner() {
    setError('')
    setScanning(true)
    try {
      const reader = new BrowserMultiFormatReader()
      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      const deviceId = devices.find(d => d.label.toLowerCase().includes('back'))?.deviceId
        ?? devices[devices.length - 1]?.deviceId
      if (!deviceId) throw new Error('No camera found')
      const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, async (result, err) => {
        if (result) {
          stopScanner()
          await lookupBarcode(result.getText())
        }
        void err
      })
      controlsRef.current = controls
    } catch (e: unknown) {
      stopScanner()
      setError(e instanceof Error ? e.message : 'Camera access failed')
    }
  }

  async function tryGeminiEnrich(draft: Ingredient, productName: string, brands: string): Promise<Ingredient | null> {
    try {
      const brand = brands.split(',')[0].trim()
      const params = new URLSearchParams({
        productName,
        brand,
        apiKey: settings.geminiApiKey,
      })
      const res = await fetch(`/api/gemini-nutrition?${params}`)
      const json = await res.json() as { status: number; nutrition?: GeminiNutrition }
      if (!res.ok || json.status !== 1 || !json.nutrition) return null
      const g = json.nutrition
      const mergedMacros: Macros = {
        calories: g.calories ?? 0,
        protein:  g.protein  ?? 0,
        carbs:    g.carbs    ?? 0,
        fiber:    g.fiber    ?? 0,
        sugar:    g.sugar    ?? 0,
        fat:      g.fat      ?? 0,
        sodium:   g.sodium   ?? 0,
      }
      return {
        ...draft,
        variants: [{
          ...draft.variants[0],
          macros: mergedMacros,
          ...(g.servingSize != null ? {
            servingSize: g.servingSize,
            servingUnit: (g.servingUnit ?? 'g') as IngredientUnit,
            defaultUnit: (g.servingUnit ?? 'g') as IngredientUnit,
          } : {}),
        }],
      }
    } catch {
      return null
    }
  }

  async function lookupBarcode(code: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(code)}`)
      const json = await res.json() as { status: number; product?: NormalizedProduct; error?: string }
      if (!res.ok || json.status !== 1 || !json.product) {
        setError(`No product found for barcode ${code}`)
        return
      }
      const draft = normalizedToIngredient(json.product, categories)

      if (isMacrosIncomplete(json.product.macros) && settings.geminiApiKey) {
        const enriched = await tryGeminiEnrich(draft, json.product.product_name, json.product.brands)
        if (enriched) {
          onReview(enriched, 'gemini')
          return
        }
      }

      onReview(draft, 'openfoodfacts')
    } catch (err) {
      setError(`Lookup failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleManualLookup() {
    const code = manualBarcode.trim()
    if (!code) return
    await lookupBarcode(code)
  }

  return (
    <div className={styles.tab}>
      <p className={styles.desc}>
        Scan a barcode with your camera or enter one manually to auto-fill product info from Open Food Facts.
      </p>

      <div className={styles.manualRow}>
        <Input
          label="Barcode number"
          value={manualBarcode}
          onChange={e => setManualBarcode(e.target.value)}
          placeholder="e.g. 038000845017"
          onKeyDown={e => { if (e.key === 'Enter') handleManualLookup() }}
          className={styles.barcodeInput}
        />
        <Button
          onClick={handleManualLookup}
          disabled={loading || !manualBarcode.trim()}
          className={styles.lookupBtn}
        >
          {loading ? 'Looking up…' : 'Lookup'}
        </Button>
      </div>

      <div className={styles.divider}><span>or</span></div>

      {!scanning ? (
        <Button variant="secondary" onClick={startScanner} className={styles.scanBtn}>
          📷 Scan Barcode with Camera
        </Button>
      ) : (
        <div className={styles.scannerArea}>
          <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
          <div className={styles.scanOverlay}>
            <div className={styles.scanTarget} />
          </div>
          <Button variant="ghost" size="sm" onClick={stopScanner} className={styles.cancelScan}>
            Cancel scan
          </Button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.credit}>
        Product data from{' '}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>{' '}
        (open database, community-maintained).
      </div>
    </div>
  )
}
