import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ScanBarcode, Microscope, Sparkles } from 'lucide-react'
import { BarcodeTab } from '@/pages/IngredientImport/BarcodeTab'
import { USDATab } from '@/pages/IngredientImport/USDATab'
import { GeminiTab } from '@/pages/IngredientImport/GeminiTab'
import { ReviewScreen } from '@/pages/IngredientImport/ReviewScreen'
import type { Ingredient, NutritionSource } from '@/types'
import styles from './MiniIngredientImportPanel.module.css'

type MiniTab = 'barcode' | 'usda' | 'gemini'

const TABS: { id: MiniTab; label: string; icon: ReactNode }[] = [
  { id: 'barcode', label: 'Barcode', icon: <ScanBarcode size={14} /> },
  { id: 'usda',    label: 'USDA',    icon: <Microscope size={14} /> },
  { id: 'gemini',  label: 'Gemini',  icon: <Sparkles size={14} /> },
]

interface Props {
  initialQuery: string
  onSaved: (ingredient: Ingredient) => void
  onBack: () => void
}

export function MiniIngredientImportPanel({ initialQuery, onSaved, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<MiniTab>('gemini')
  const [reviewDraft, setReviewDraft] = useState<Ingredient | null>(null)
  const [nutritionSource, setNutritionSource] = useState<NutritionSource | undefined>(undefined)

  if (reviewDraft) {
    return (
      <div className={styles.reviewWrap}>
        <ReviewScreen
          draft={reviewDraft}
          onSaved={onSaved}
          onCancel={() => setReviewDraft(null)}
          nutritionSource={nutritionSource}
        />
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className={styles.tabs} role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.tabBody}>
        {activeTab === 'barcode' && (
          <BarcodeTab
            onReview={(draft, source) => { setReviewDraft(draft); setNutritionSource(source) }}
            onExistingFound={onSaved}
          />
        )}
        {activeTab === 'usda' && (
          <USDATab
            onReview={draft => { setReviewDraft(draft); setNutritionSource('usda') }}
            initialQuery={initialQuery}
          />
        )}
        {activeTab === 'gemini' && (
          <GeminiTab
            onReview={draft => { setReviewDraft(draft); setNutritionSource('gemini') }}
            initialQuery={initialQuery}
          />
        )}
      </div>
    </div>
  )
}
