import { useState, useRef, useEffect } from 'react'
import Quagga from '@ericblade/quagga2'
import { Button, Input } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { newId, now } from '@/utils/ids'
import { findIngredientByBarcode } from '@/db/ingredients'
import type { Ingredient, IngredientUnit, Macros, NutritionSource, NutriscoreGrade, NovaGroupNum } from '@/types'
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

interface NormalizedProduct {
  product_name: string
  brands: string
  categories_tags: string[]
  serving_display_size: number
  serving_display_unit: string
  serving_quantity_g: number
  macros: Macros
  barcode?: string
  nutriscore?: NutriscoreGrade
  novaGroup?: NovaGroupNum
  allergens?: string[]
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
      ...(product.barcode ? { barcode: product.barcode } : {}),
      ...(product.nutriscore ? { nutriscore: product.nutriscore } : {}),
      ...(product.novaGroup ? { novaGroup: product.novaGroup } : {}),
      ...(product.allergens && product.allergens.length > 0 ? { allergens: product.allergens } : {}),
    }],
  }
}

// Brief success beep using Web Audio API — silent if unsupported
function playBeep() {
  try {
    const CtxClass = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!CtxClass) return
    const ctx = new CtxClass()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1047, ctx.currentTime)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
    setTimeout(() => { try { ctx.close() } catch { /* ignore */ } }, 600)
  } catch { /* AudioContext unavailable */ }
}

type ScanState = 'idle' | 'loading' | 'active' | 'denied' | 'nocamera' | 'error'

type QuaggaDetected = { codeResult: { code: string | null } }

interface Props {
  onReview: (draft: Ingredient, source: NutritionSource) => void
  /** Fires instead of onReview when the barcode already matches an ingredient
   *  in the local database — skips the API call entirely. */
  onExistingFound: (ingredient: Ingredient) => void
}

export function BarcodeTab({ onReview, onExistingFound }: Props) {
  const { settings } = useSettings()
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanError, setScanError]   = useState('')
  const [scanFlash, setScanFlash]   = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  // Incrementing trigger fires the scanner init useEffect
  const [scanTrigger, setScanTrigger] = useState(0)

  const scannerContainerRef = useRef<HTMLDivElement>(null)
  const manualInputRef      = useRef<HTMLInputElement>(null)
  const quaggaActiveRef     = useRef(false)
  const scannedRef          = useRef(false)

  const categories = settings.ingredientCategories.length > 0
    ? settings.ingredientCategories
    : DEFAULT_CATEGORIES

  // ── Quagga init effect ──────────────────────────────────────────────────
  // Runs after the scannerContainer div has been rendered into the DOM.
  useEffect(() => {
    if (scanTrigger === 0) return

    let cancelled = false
    scannedRef.current = false

    function detected(result: QuaggaDetected) {
      if (cancelled || scannedRef.current) return
      const code = result.codeResult.code
      if (!code) return
      scannedRef.current = true

      // Visual + haptic feedback
      setScanFlash(true)
      setTimeout(() => setScanFlash(false), 700)
      playBeep()
      try { navigator.vibrate?.(120) } catch { /* not supported */ }

      // Stop camera immediately so battery isn't drained
      try { Quagga.offDetected(detected) } catch { /* ignore */ }
      try { Quagga.stop() } catch { /* ignore */ }
      quaggaActiveRef.current = false
      if (!cancelled) setScanState('idle')

      lookupBarcode(code)
    }

    (async () => {
      try {
        await Quagga.init({
          inputStream: {
            type: 'LiveStream',
            target: scannerContainerRef.current!,
            constraints: {
              // ideal = prefer rear camera, fall back to any if unavailable
              facingMode: { ideal: 'environment' },
              width:  { min: 320, ideal: 1280 },
              height: { min: 240, ideal: 720  },
            },
          },
          locator: {
            patchSize: 'medium',
            halfSample: true,  // faster on mobile
          },
          numOfWorkers: 0,   // safest across all browsers including iOS Safari
          frequency: 10,     // frames/sec — balance between speed and battery
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
            ],
          },
          locate: true,
        })

        if (cancelled) {
          try { Quagga.stop() } catch { /* ignore */ }
          return
        }

        quaggaActiveRef.current = true
        Quagga.start()
        Quagga.onDetected(detected)
        setScanState('active')

      } catch (err) {
        if (cancelled) return
        quaggaActiveRef.current = false
        const name = err instanceof Error ? err.name    : String(err)
        const msg  = err instanceof Error ? err.message : String(err)
        console.error('[BarcodeTab] Quagga init error:', name, msg)

        const msgLc = msg.toLowerCase()
        if (
          name === 'NotAllowedError'    ||
          name === 'PermissionDeniedError' ||
          name === 'SecurityError'      ||
          msgLc.includes('permission') ||
          msgLc.includes('denied')
        ) {
          setScanState('denied')
        } else if (
          name === 'NotFoundError'        ||
          name === 'DevicesNotFoundError' ||
          name === 'NotReadableError'     ||
          msgLc.includes('no camera')    ||
          msgLc.includes('not found')
        ) {
          setScanState('nocamera')
        } else {
          setScanState('error')
          setScanError(`Camera error: ${msg}`)
        }
        setTimeout(() => manualInputRef.current?.focus(), 150)
      }
    })()

    return () => {
      cancelled = true
      if (quaggaActiveRef.current) {
        try { Quagga.offDetected(detected) } catch { /* ignore */ }
        try { Quagga.stop() } catch { /* ignore */ }
        quaggaActiveRef.current = false
      }
    }
  }, [scanTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop camera when tab switches away or component unmounts
  useEffect(() => {
    return () => {
      if (quaggaActiveRef.current) {
        try { Quagga.stop() } catch { /* ignore */ }
        quaggaActiveRef.current = false
      }
    }
  }, [])

  function handleStartScan() {
    setError('')
    setScanError('')
    setScanState('loading')
    setScanTrigger(t => t + 1)
  }

  function handleStopScan() {
    if (quaggaActiveRef.current) {
      try { Quagga.stop() } catch { /* ignore */ }
      quaggaActiveRef.current = false
    }
    setScanState('idle')
  }

  async function tryGeminiEnrich(draft: Ingredient, productName: string, brands: string): Promise<Ingredient | null> {
    try {
      const brand = brands.split(',')[0].trim()
      const res = await fetch('/api/gemini-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          brand,
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel || 'gemini-3.1-flash-lite',
        }),
      })
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
      // Check the local database first — if this barcode is already saved, link to
      // it directly instead of burning an API call (and works offline too).
      const existing = await findIngredientByBarcode(code)
      if (existing) {
        onExistingFound(existing)
        return
      }

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

  const showScanner = scanState === 'loading' || scanState === 'active'

  return (
    <div className={styles.tab}>
      <p className={styles.desc}>
        Scan a barcode with your camera or enter one manually to auto-fill product info from Open Food Facts.
      </p>

      <div className={styles.disclaimer}>
        <strong>⚠️ Always verify nutrition values against the product label before saving.</strong>{' '}
        Community database data may be incomplete or inaccurate.
      </div>

      {/* ── Manual barcode entry (always visible) ── */}
      <div className={styles.manualRow}>
        <Input
          ref={manualInputRef}
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

      {/* ── Camera scanner section ── */}
      {showScanner ? (
        <div className={styles.scannerArea}>
          {/* Quagga injects its <video> and <canvas> inside this div */}
          <div ref={scannerContainerRef} className={styles.scannerContainer} />

          {/* Loading / permission-request overlay */}
          {scanState === 'loading' && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner} />
              <p className={styles.loadingText}>Starting camera…</p>
              <p className={styles.permissionNote}>
                We need access to your camera to scan barcodes.{' '}
                Please tap <strong>Allow</strong> when prompted.
              </p>
            </div>
          )}

          {/* Scan guide overlay */}
          {scanState === 'active' && (
            <div className={styles.scanOverlay}>
              <div className={`${styles.scanBox} ${scanFlash ? styles.scanBoxFlash : ''}`}>
                <span className={`${styles.scanCorner} ${styles.scanCornerTL}`} />
                <span className={`${styles.scanCorner} ${styles.scanCornerTR}`} />
                <span className={`${styles.scanCorner} ${styles.scanCornerBL}`} />
                <span className={`${styles.scanCorner} ${styles.scanCornerBR}`} />
              </div>
              <p className={styles.scanHint}>Align barcode within the box</p>
            </div>
          )}

          <button
            className={styles.cancelScanBtn}
            onClick={handleStopScan}
            aria-label="Cancel camera scan"
          >
            ✕ Cancel
          </button>
        </div>
      ) : (
        <>
          {scanState === 'idle' && (
            <Button onClick={handleStartScan} className={styles.scanBtn}>
              📷 Scan Barcode with Camera
            </Button>
          )}

          {scanState === 'denied' && (
            <div className={styles.scanErrorBox}>
              <span className={styles.scanErrorIcon} aria-hidden="true">🚫</span>
              <div>
                <p className={styles.scanErrorTitle}>Camera access was denied</p>
                <p className={styles.scanErrorText}>
                  To enable it, tap the lock icon in your browser's address bar and allow camera
                  access, then refresh the page.
                </p>
                <button className={styles.retryBtn} onClick={handleStartScan}>Try again</button>
              </div>
            </div>
          )}

          {scanState === 'nocamera' && (
            <div className={styles.scanErrorBox}>
              <span className={styles.scanErrorIcon} aria-hidden="true">📷</span>
              <div>
                <p className={styles.scanErrorTitle}>No camera found</p>
                <p className={styles.scanErrorText}>
                  No camera was detected on this device. Please enter the barcode number manually
                  using the field above.
                </p>
              </div>
            </div>
          )}

          {scanState === 'error' && (
            <div className={styles.scanErrorBox}>
              <span className={styles.scanErrorIcon} aria-hidden="true">⚠️</span>
              <div>
                <p className={styles.scanErrorTitle}>Camera error</p>
                <p className={styles.scanErrorText}>{scanError}</p>
                <button className={styles.retryBtn} onClick={handleStartScan}>Try again</button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {/* ── Collapsible help tips ── */}
      <div className={styles.helpSection}>
        <button
          className={styles.helpToggle}
          onClick={() => setHelpOpen(v => !v)}
          aria-expanded={helpOpen}
        >
          Having trouble scanning?
          <span className={styles.helpChevron} aria-hidden="true">{helpOpen ? '▲' : '▼'}</span>
        </button>
        {helpOpen && (
          <ul className={styles.helpList}>
            <li>Make sure you have good lighting — barcodes are hard to read in dim light.</li>
            <li>Hold the barcode steady about 6–8 inches from the camera.</li>
            <li>Make sure the entire barcode fits within the green scanning box.</li>
            <li>Try tilting the product slightly if it is not scanning.</li>
            <li>If scanning still does not work, type the barcode number manually in the field above.</li>
          </ul>
        )}
      </div>

      <div className={styles.credit}>
        Product data from{' '}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>{' '}
        (open database, community-maintained).
      </div>
    </div>
  )
}
