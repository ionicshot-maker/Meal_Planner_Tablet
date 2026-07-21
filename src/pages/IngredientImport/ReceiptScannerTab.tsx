import { useState, useRef } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { PhotoCaptureCrop } from '@/components/PhotoCaptureCrop'
import { getAllIngredients } from '@/db/ingredients'
import { findMatchingProcessedReceipt } from '@/db/processedReceipts'
import { normalizeLine, type ParsedReceiptLine } from '@/utils/receiptPriceNormalization'
import { matchLine, resolveCandidateSelection, candidateLabel } from '@/utils/receiptMatching'
import { newId } from '@/utils/ids'
import { ReceiptLineReview, type ReceiptLineDraft } from './ReceiptLineReview'
import styles from './ScanLabelTab.module.css'

const TIPS = [
  'Lay the receipt flat and make sure it isn’t curled at the edges',
  'Good lighting with no glare — receipt paper is reflective',
  'Crop tightly to just the itemized lines for the clearest read',
  'Long receipts: scan in sections if one photo can’t fit it all in focus',
]

type Stage = 'capture' | 'photoDecision' | 'duplicateWarning' | 'bulkReview' | 'lowConfidence'

interface GeminiReceiptResponse {
  status?: number
  store?: string | null
  date?: string | null
  total?: number | null
  items?: ParsedReceiptLine[]
  lowConfidence?: boolean
  reason?: string
  error?: string
}

interface Props {
  onItemSaved: (name: string) => void
}

export function ReceiptScannerTab({ onItemSaved }: Props) {
  const { settings } = useSettings()
  const [stage, setStage] = useState<Stage>('capture')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lowConfidenceReason, setLowConfidenceReason] = useState('')
  const [lines, setLines] = useState<ReceiptLineDraft[]>([])
  const [receiptMeta, setReceiptMeta] = useState<{ store: string | null; date: string | null; total: number | null }>({ store: null, date: null, total: null })
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [duplicateInfo, setDuplicateInfo] = useState<{ processedAt: string } | null>(null)
  const pendingItemsRef = useRef<ParsedReceiptLine[] | undefined>(undefined)

  const hasKey = Boolean(settings.geminiApiKey)
  const defaultCategory = settings.ingredientCategories[0] ?? 'Baking & Pantry'

  async function buildLinesAndProceed(items: ParsedReceiptLine[]) {
    const allIngredients = await getAllIngredients(true)
    const drafts: ReceiptLineDraft[] = items.map(item => {
      const normalized = normalizeLine(item)
      const result = matchLine(normalized, allIngredients)
      const top = result.candidates[0]
      const startingUnitPrice = normalized.scaledPrice ?? normalized.unitPrice
      const selection = result.tier === 'high' && top
        ? resolveCandidateSelection(normalized, top, '', startingUnitPrice)
        : null
      return {
        id: newId(),
        normalized,
        match: result,
        mode: result.tier === 'high' ? 'match' : result.tier === 'medium' ? 'pending' : 'createNew',
        selectedIngredientId: selection?.selectedIngredientId,
        selectedVariantId: selection?.selectedVariantId,
        selectedLabel: selection && top ? candidateLabel(top) : undefined,
        editableName: normalized.parsedName,
        editableUnitPrice: startingUnitPrice,
        editableServings: selection?.servings ?? '',
        newCategory: normalized.categoryHint || defaultCategory,
        newBrand: '',
        priceDecision: selection?.priceDecision ?? 'not-needed',
        saved: false,
        error: '',
      }
    })
    setLines(drafts)
    setStage('bulkReview')
  }

  async function handlePhotoCaptured(dataUrl: string) {
    setError('')
    setLoading(true)
    try {
      const commaIdx = dataUrl.indexOf(',')
      const base64 = dataUrl.slice(commaIdx + 1)
      const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:(.*);base64/)
      const mimeType = mimeMatch?.[1] || 'image/jpeg'

      const res = await fetch('/api/gemini-receipt-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mimeType,
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel || 'gemini-3.1-flash-lite',
        }),
      })
      const json = await res.json() as GeminiReceiptResponse

      if (!res.ok || json.error) {
        setError(json.error ?? 'Could not read the receipt. Try again.')
        return
      }
      if (json.lowConfidence || !json.items || json.items.length === 0) {
        setLowConfidenceReason(json.reason ?? 'The receipt was unclear.')
        setStage('lowConfidence')
        return
      }

      const meta = { store: json.store ?? null, date: json.date ?? null, total: json.total ?? null }
      setReceiptMeta(meta)
      setCapturedPhoto(dataUrl)

      const dupe = await findMatchingProcessedReceipt(meta.store, meta.date, meta.total)
      if (dupe) {
        setDuplicateInfo({ processedAt: dupe.processedAt })
        setStage('duplicateWarning')
        // Stash items so "proceed anyway" can pick up where we left off.
        pendingItemsRef.current = json.items
        return
      }

      await buildLinesAndProceed(json.items)
      setStage('photoDecision')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the receipt. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleProceedDespiteDuplicate() {
    setDuplicateInfo(null)
    if (pendingItemsRef.current) await buildLinesAndProceed(pendingItemsRef.current)
    setStage('photoDecision')
  }

  function resetScan() {
    setStage('capture')
    setLowConfidenceReason('')
    setError('')
    setLines([])
    setCapturedPhoto(null)
    setDuplicateInfo(null)
  }

  function handlePhotoDecision(keep: boolean) {
    if (!keep) setCapturedPhoto(null)
    setStage('bulkReview')
  }

  if (!hasKey) {
    return (
      <div className={styles.tab}>
        <div className={styles.noKeyMsg}>
          <p className={styles.noKeyTitle}>Gemini API Key Required</p>
          <p className={styles.noKeyDesc}>
            Add a free Google Gemini API key in <strong>Settings → Integrations → Google Gemini</strong> to
            scan receipts — Gemini reads the photo and extracts each line item for you.
          </p>
        </div>
      </div>
    )
  }

  if (stage === 'duplicateWarning') {
    return (
      <div className={styles.tab}>
        <div className={styles.lowConfidenceBox}>
          <p className={styles.lowConfidenceTitle}>⚠️ This looks like a receipt you've already processed.</p>
          <p className={styles.lowConfidenceBody}>
            A receipt from {receiptMeta.store ?? 'this store'} dated {receiptMeta.date ?? 'the same date'} with the
            same total was already applied {duplicateInfo ? `(processed ${new Date(duplicateInfo.processedAt).toLocaleString()})` : ''}.
            Re-applying it would re-price the same items a second time.
          </p>
          <div className={styles.lowConfidenceActions}>
            <button type="button" className={styles.btnCancel} onClick={resetScan}>Cancel</button>
            <button type="button" className={styles.btnImport} onClick={handleProceedDespiteDuplicate}>
              Proceed Anyway
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'photoDecision') {
    return (
      <div className={styles.tab}>
        <div className={styles.lowConfidenceBox}>
          <p className={styles.lowConfidenceTitle}>Would you like to keep the receipt photo?</p>
          <p className={styles.lowConfidenceBody}>
            It'll be stored alongside this scan's record so you can refer back to it later.
          </p>
          <div className={styles.lowConfidenceActions}>
            <button type="button" className={styles.btnImport} onClick={() => handlePhotoDecision(true)}>
              Keep Photo
            </button>
            <button type="button" className={styles.btnCancel} onClick={() => handlePhotoDecision(false)}>
              Text Only — Discard Photo
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'bulkReview') {
    return (
      <ReceiptLineReview
        lines={lines}
        setLines={setLines}
        storeName={receiptMeta.store}
        receiptDate={receiptMeta.date}
        receiptTotal={receiptMeta.total}
        photoDataUrl={capturedPhoto}
        defaultCategory={defaultCategory}
        onItemSaved={onItemSaved}
        onStartOver={resetScan}
      />
    )
  }

  return (
    <div className={styles.tab}>
      {stage === 'capture' && (
        <>
          <p className={styles.desc}>
            Take or upload a photo of a grocery receipt. Every item is matched against your existing
            ingredients (or flagged for review) before anything is written — nothing is applied
            automatically.
          </p>
          <PhotoCaptureCrop
            primaryLabel="Take Photo or Scan Receipt"
            tipsTitle="🧾 Tips for scanning receipts:"
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
              <p className={styles.scanningText}>Reading receipt…</p>
            </div>
          )}
        </>
      )}

      {stage === 'lowConfidence' && (
        <div className={styles.lowConfidenceBox}>
          <p className={styles.lowConfidenceTitle}>
            ⚠️ We could not read this receipt clearly.
          </p>
          <p className={styles.lowConfidenceBody}>
            Try cropping tighter to just the itemized lines, or make sure the receipt is well lit,
            flat, and in focus.
          </p>
          {lowConfidenceReason && (
            <p className={styles.lowConfidenceReason}>Gemini said: "{lowConfidenceReason}"</p>
          )}
          <div className={styles.lowConfidenceActions}>
            <button type="button" className={styles.btnCancel} onClick={resetScan}>
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
