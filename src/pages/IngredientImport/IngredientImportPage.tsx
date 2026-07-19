import { useState, useEffect, ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHouseholdTitle } from '@/context/SettingsContext'
import { newId } from '@/utils/ids'
import { ScanBarcode, Microscope, Sparkles, ClipboardList, ScanText } from 'lucide-react'
import { BarcodeTab } from './BarcodeTab'
import { USDATab } from './USDATab'
import { BulkEntryTab } from './BulkEntryTab'
import { GeminiTab } from './GeminiTab'
import { ScanLabelTab } from './ScanLabelTab'
import { ReviewScreen } from './ReviewScreen'
import { Toast } from './Toast'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import type { Ingredient, NutritionSource } from '@/types'
import styles from './IngredientImportPage.module.css'

const DRAFT_KEY = 'ingredient_import_draft'

interface SavedDraft {
  ingredient: Ingredient
  nutritionSource: NutritionSource
  savedAt: string
}

type TabId = 'barcode' | 'usda' | 'bulk' | 'gemini' | 'scanLabel'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'barcode',   label: 'Barcode Lookup',  icon: <ScanBarcode size={18} /> },
  { id: 'usda',      label: 'USDA Lookup',     icon: <Microscope size={18} /> },
  { id: 'gemini',    label: 'Gemini Lookup',   icon: <Sparkles size={18} /> },
  { id: 'scanLabel', label: 'Scan Label',      icon: <ScanText size={18} /> },
  { id: 'bulk',      label: 'Bulk Entry',      icon: <ClipboardList size={18} /> },
]

interface ToastItem { id: string; message: string }

// Words that are never the primary ingredient: prepositions, liquids, cooking methods,
// size/grade descriptors, colors used as qualifiers, and a few known brand fragments.
const SEARCH_FILLER = new Set([
  // structure / prepositions
  'in', 'with', 'and', 'or', 'of', 'from', 'for', 'on', 'at', 'by', 'the', 'a', 'an',
  // liquids / cooking media
  'oil', 'oils', 'water', 'brine', 'sauce', 'juice', 'syrup', 'broth', 'stock', 'vinegar',
  'soybean', 'sunflower', 'olive', 'canola', 'vegetable', 'cottonseed', 'palm',
  // flavor descriptors
  'natural', 'artificial', 'flavor', 'flavors', 'flavored',
  'seasoned', 'seasoning', 'spiced', 'spicy', 'mild', 'hot', 'whot', 'sweet', 'sour',
  'chilies', 'chiles', 'chile', 'chili', 'jalapeno', 'jalapenos', 'peppers',
  // colors used as qualifiers
  'green', 'red', 'white', 'yellow', 'black', 'dark', 'light', 'golden', 'orange', 'blue',
  // cooking methods / processing
  'roasted', 'smoked', 'grilled', 'baked', 'fried', 'boiled', 'dried', 'dehydrated',
  'cooked', 'raw', 'fresh', 'frozen', 'canned', 'packed', 'ground', 'minced',
  'chopped', 'sliced', 'diced', 'shredded', 'chunk', 'chunks', 'pieces',
  'fillets', 'fillet', 'strips', 'cubed', 'whole', 'boneless', 'skinless',
  // marketing / size / grade
  'small', 'large', 'medium', 'big', 'mini', 'jumbo', 'family', 'individual',
  'premium', 'select', 'grade', 'fancy', 'choice', 'prime', 'extra', 'ultra',
  'original', 'classic', 'traditional', 'homestyle', 'style', 'new', 'improved',
  'low', 'high', 'reduced', 'no', 'less', 'added', 'free', 'lite', 'light',
  // simple added ingredients (not the main food)
  'salt', 'salted', 'unsalted', 'spices', 'herbs', 'sugar', 'sodium',
  // known brand fragment (user-specified)
  'cliff',
])

// Strip brand names, cooking descriptors, and filler so that e.g.
// "Beach cliff in soybean oil whot green chilies sardines" → "sardines"
function extractSearchTerm(productName: string): string {
  const tokens = productName
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !SEARCH_FILLER.has(t))

  if (tokens.length === 0) return productName
  // The actual food noun is almost always last — brand / descriptors come first
  return tokens[tokens.length - 1]
}

function isNutritionIncomplete(ingredient: Ingredient): boolean {
  const macros = ingredient.variants[0]?.macros
  if (!macros) return true
  return (macros.calories ?? 0) === 0
      && (macros.protein  ?? 0) === 0
      && (macros.carbs    ?? 0) === 0
      && (macros.fat      ?? 0) === 0
}

export default function IngredientImportPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pageTitle = useHouseholdTitle('Import Ingredients')
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get('tab') as TabId | null
    return tab && TABS.some(t => t.id === tab) ? tab : 'barcode'
  })
  const [reviewDraft, setReviewDraft] = useState<Ingredient | null>(null)
  const [reviewNutritionSource, setReviewNutritionSource] = useState<NutritionSource | null>(null)
  const [reviewUncertainFields, setReviewUncertainFields] = useState<Set<string>>(new Set())
  const [reviewNotice, setReviewNotice] = useState<{ level: 'success' | 'warning'; message: string } | null>(null)
  const [usdaInitialQuery, setUsdaInitialQuery] = useState(() => searchParams.get('q') ?? '')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pendingDraft, setPendingDraft] = useState<SavedDraft | null>(null)

  function checkForDraft() {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) { setPendingDraft(null); return }
    try { setPendingDraft(JSON.parse(raw) as SavedDraft) } catch { setPendingDraft(null) }
  }

  useEffect(() => { checkForDraft() }, [])

  function addToast(name: string) {
    const id = newId()
    setToasts(t => [...t, { id, message: `"${name}" saved!` }])
  }

  function removeToast(id: string) {
    setToasts(t => t.filter(x => x.id !== id))
  }

  function handleBarcodeReview(draft: Ingredient, source: NutritionSource) {
    setReviewDraft(draft)
    setReviewNutritionSource(source)
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
  }

  function handleExistingBarcodeFound(ingredient: Ingredient) {
    addToast(`${ingredient.name} — already in your database`)
    navigate(`/ingredients?edit=${ingredient.id}`)
  }

  function handleUsdaReview(draft: Ingredient) {
    setReviewDraft(draft)
    setReviewNutritionSource('usda')
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
  }

  function handleGeminiReview(draft: Ingredient) {
    setReviewDraft(draft)
    setReviewNutritionSource('gemini')
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
  }

  function handleLabelScanReview(draft: Ingredient, uncertainFields: Set<string>, notice: { level: 'success' | 'warning'; message: string }) {
    setReviewDraft(draft)
    setReviewNutritionSource('gemini')
    setReviewUncertainFields(uncertainFields)
    setReviewNotice(notice)
  }

  function handleSaved(ingredient: Ingredient) {
    setReviewDraft(null)
    setReviewNutritionSource(null)
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
    localStorage.removeItem(DRAFT_KEY)
    setPendingDraft(null)
    addToast(ingredient.name)
  }

  function handleCancelReview() {
    setReviewDraft(null)
    setReviewNutritionSource(null)
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
    checkForDraft()
  }

  function handleResumeDraft() {
    if (!pendingDraft) return
    setReviewDraft(pendingDraft.ingredient)
    setReviewNutritionSource(pendingDraft.nutritionSource)
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
    setPendingDraft(null)
  }

  function handleDiscardDraft() {
    localStorage.removeItem(DRAFT_KEY)
    setPendingDraft(null)
  }

  function handleSearchUSDA() {
    const name = reviewDraft?.name ?? ''
    setReviewDraft(null)
    setReviewNutritionSource(null)
    setReviewUncertainFields(new Set())
    setReviewNotice(null)
    setUsdaInitialQuery(extractSearchTerm(name))
    setActiveTab('usda')
  }

  function handleBulkSaved(name: string) {
    addToast(name)
  }

  const showNutritionWarning =
    reviewNutritionSource === 'openfoodfacts' && reviewDraft !== null && isNutritionIncomplete(reviewDraft)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/ingredients')}>
            ← Ingredients
          </button>
          <h1 className={styles.heading}>{pageTitle}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button className={styles.doneBtn} onClick={() => navigate('/ingredients')}>
            Done
          </button>
          <PageHelpButton />
        </div>
      </header>

      {reviewDraft ? (
        <div className={styles.reviewWrapper}>
          <div className={styles.reviewHeader}>
            <h2 className={styles.reviewTitle}>Review & Edit</h2>
          </div>
          <ReviewScreen
            draft={reviewDraft}
            onSaved={handleSaved}
            onCancel={handleCancelReview}
            onSearchUSDA={showNutritionWarning ? handleSearchUSDA : undefined}
            nutritionSource={reviewNutritionSource ?? 'manual'}
            uncertainFields={reviewUncertainFields}
            notice={reviewNotice ?? undefined}
          />
        </div>
      ) : (
        <div className={styles.tabContainer}>
          {pendingDraft && (
            <div className={styles.draftBanner}>
              <span className={styles.draftBannerText}>
                You have an unsaved ingredient in progress: <strong>{pendingDraft.ingredient.name || 'Untitled'}</strong>
              </span>
              <div className={styles.draftBannerActions}>
                <button className={styles.draftBannerDiscard} onClick={handleDiscardDraft}>Discard</button>
                <button className={styles.draftBannerResume} onClick={handleResumeDraft}>Resume</button>
              </div>
            </div>
          )}
          <div className={styles.tabBar} role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.tabContent} role="tabpanel">
            {activeTab === 'barcode' && (
              <BarcodeTab onReview={handleBarcodeReview} onExistingFound={handleExistingBarcodeFound} />
            )}
            {activeTab === 'usda' && (
              <USDATab onReview={handleUsdaReview} initialQuery={usdaInitialQuery} />
            )}
            {activeTab === 'gemini' && (
              <GeminiTab onReview={handleGeminiReview} initialQuery={searchParams.get('q') ?? ''} />
            )}
            {activeTab === 'scanLabel' && (
              <ScanLabelTab onReview={handleLabelScanReview} />
            )}
            {activeTab === 'bulk' && (
              <BulkEntryTab onSaved={handleBulkSaved} />
            )}
          </div>
        </div>
      )}

      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          onDone={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}
