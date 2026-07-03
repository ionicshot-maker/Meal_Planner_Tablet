import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { PhotoCaptureCrop } from '@/components/PhotoCaptureCrop'
import {
  importRecipeFromUrl, importRecipeFromText, importRecipeFromPhoto,
  isRecipeImportAvailable, effectiveRecipeAI, recipeAILabel,
  isPhotoImportAvailable, effectivePhotoGeminiKey,
} from '@/utils/aiImport'
import type { AIRecipeResult, UncertainField } from '@/utils/aiImport'
import type { ImportNotice } from './RecipeEditor'
import styles from './RecipeImportModal.module.css'

type Tab = 'url' | 'paste' | 'photo'
type PhotoStage = 'capture' | 'preview' | 'lowConfidence'

const PHOTO_TIPS = [
  'Place the recipe on a flat surface in good lighting',
  'Make sure all text is in focus and fully visible',
  'Take the photo straight on, not at an angle',
  'If the recipe spans multiple pages, take one photo per page and import separately',
  'Handwritten recipes work, but printed recipes give better results',
]

interface Props {
  onImported: (result: AIRecipeResult, notice?: ImportNotice, uncertainFields?: UncertainField[]) => void
  onManualWithReference: (text: string) => void
  onManualEntry: () => void
  onClose: () => void
}

export function RecipeImportModal({ onImported, onManualWithReference, onManualEntry, onClose }: Props) {
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Photo tab state
  const [photoStage, setPhotoStage] = useState<PhotoStage>('capture')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [lowConfidenceReason, setLowConfidenceReason] = useState('')

  const aiConfigured = isRecipeImportAvailable(settings)
  const aiLabel = recipeAILabel(settings)
  const effectiveAI = effectiveRecipeAI(settings)
  const geminiModel = settings.geminiModel || 'gemini-2.5-flash'
  const photoConfigured = isPhotoImportAvailable(settings)

  function goToSettings() {
    onClose()
    navigate('/settings')
  }

  function goToHelp() {
    onClose()
    navigate('/help')
  }

  async function handleUrlImport() {
    if (!url.trim()) { setError('Please enter a URL.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await importRecipeFromUrl(url.trim(), effectiveAI, geminiModel)
      onImported(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed. Try pasting the text instead.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) { setError('Please paste recipe text.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await importRecipeFromText(pasteText.trim(), effectiveAI, geminiModel)
      onImported(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed. Check your AI provider settings.')
    } finally {
      setLoading(false)
    }
  }

  // ── Photo tab ──────────────────────────────────────────────────────────────

  function handlePhotoCaptured(dataUrl: string) {
    setPhotoDataUrl(dataUrl)
    setPhotoStage('preview')
  }

  function resetPhoto() {
    setPhotoDataUrl(null)
    setPhotoStage('capture')
    setLowConfidenceReason('')
    setError('')
  }

  async function handlePhotoParse() {
    if (!photoDataUrl) return
    setError('')
    setLoading(true)
    try {
      const commaIdx = photoDataUrl.indexOf(',')
      const base64 = photoDataUrl.slice(commaIdx + 1)
      const mimeMatch = photoDataUrl.slice(0, commaIdx).match(/data:(.*);base64/)
      const mimeType = mimeMatch?.[1] || 'image/jpeg'
      const geminiKey = effectivePhotoGeminiKey(settings)

      const outcome = await importRecipeFromPhoto(base64, mimeType, geminiKey, geminiModel)

      if (outcome.lowConfidence) {
        setLowConfidenceReason(outcome.reason)
        setPhotoStage('lowConfidence')
        return
      }

      const isComplete = outcome.uncertainFields.length === 0
      const notice: ImportNotice = isComplete
        ? { level: 'success', message: 'Recipe extracted successfully — please review everything before saving.' }
        : {
            level: 'warning',
            message: 'Some fields could not be read clearly from the photo — highlighted fields below need your attention before saving.',
            subMessage: 'Always verify ingredient quantities carefully — measurement errors in recipes can significantly affect results.',
          }
      onImported(outcome.result, notice, outcome.uncertainFields)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not read the recipe photo. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Import Recipe">

        <header className={styles.header}>
          <h2 className={styles.title}>Import Recipe</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </header>

        {aiConfigured && aiLabel && (
          <div className={styles.aiBadge}>
            ✨ Powered by {aiLabel}
          </div>
        )}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'url' ? styles.tabActive : ''}`}
            onClick={() => { setTab('url'); setError('') }}
          >
            Import from URL
          </button>
          <button
            className={`${styles.tab} ${tab === 'paste' ? styles.tabActive : ''}`}
            onClick={() => { setTab('paste'); setError('') }}
          >
            Paste Recipe Text
          </button>
          <button
            className={`${styles.tab} ${tab === 'photo' ? styles.tabActive : ''}`}
            onClick={() => { setTab('photo'); setError('') }}
          >
            <Camera size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Photo
          </button>
        </div>

        <div className={styles.body}>

          {/* ── URL tab ── */}
          {tab === 'url' && aiConfigured && (
            <div className={styles.tabPane}>
              <p className={styles.hint}>
                Paste a recipe URL and the AI will fetch and extract the recipe automatically.
                Some sites block outside access — if it fails, copy the page text and use the Paste tab.
              </p>
              <label className={styles.label}>Recipe URL</label>
              <input
                type="url"
                className={styles.input}
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleUrlImport()}
                placeholder="https://www.example.com/recipe/..."
                autoFocus
                disabled={loading}
              />
              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}

          {tab === 'url' && !aiConfigured && (
            <div className={styles.tabPane}>
              <div className={styles.noAiBox}>
                <p className={styles.noAiTitle}>AI provider required for URL import</p>
                <p className={styles.noAiBody}>
                  Automatically fetching and reading a recipe from a URL requires an AI provider.
                  You can use your free Gemini code — go to Settings → Integrations and enter it in the
                  Google Gemini box. No extra cost, completely free.
                </p>
                <button className={styles.btnSettings} onClick={goToSettings}>
                  Go to Settings → Integrations
                </button>
              </div>

              <div className={styles.divider}>or open it manually</div>

              <div className={styles.manualUrlRow}>
                <label className={styles.label}>Recipe URL</label>
                <div className={styles.urlRow}>
                  <input
                    type="url"
                    className={styles.input}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://www.example.com/recipe/..."
                  />
                  <button
                    className={styles.btnOpenBrowser}
                    onClick={() => url.trim() && window.open(url.trim(), '_blank')}
                    disabled={!url.trim()}
                  >
                    Open in browser ↗
                  </button>
                </div>
                <p className={styles.manualHint}>
                  Open the recipe in your browser, copy the text, then come back and use the
                  <button className={styles.inlineTabLink} onClick={() => setTab('paste')}>
                    Paste text tab
                  </button>
                  to enter it manually.
                </p>
              </div>
            </div>
          )}

          {/* ── Paste tab ── */}
          {tab === 'paste' && aiConfigured && (
            <div className={styles.tabPane}>
              <p className={styles.hint}>
                Copy the full recipe text — ingredients, instructions, and all — then paste it below.
                The AI will parse it into structured fields for you to review.
              </p>
              <label className={styles.label}>Recipe Text</label>
              <textarea
                className={styles.textarea}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste the full recipe text here…"
                rows={12}
                disabled={loading}
                autoFocus={tab === 'paste'}
              />
              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}

          {tab === 'paste' && !aiConfigured && (
            <div className={styles.tabPane}>
              <p className={styles.hint}>
                Paste the recipe text below. We'll show it alongside the recipe editor so you can
                read the original on the left and fill in the fields on the right.
              </p>
              <label className={styles.label}>Recipe Text</label>
              <textarea
                className={styles.textarea}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste the full recipe text here…"
                rows={10}
                autoFocus={tab === 'paste'}
              />
              <div className={styles.noAiPasteHint}>
                <span>
                  With a free Gemini code in Settings → Integrations, we can parse this automatically.{' '}
                  <button className={styles.inlineTabLink} onClick={goToSettings}>
                    Set up Gemini →
                  </button>
                </span>
              </div>
            </div>
          )}

          {/* ── Photo tab ── */}
          {tab === 'photo' && photoConfigured && (
            <div className={styles.tabPane}>

              {photoStage === 'capture' && (
                <PhotoCaptureCrop
                  primaryLabel="Take Photo or Scan Recipe"
                  tipsTitle="📸 Tips for best results:"
                  tips={PHOTO_TIPS}
                  onComplete={handlePhotoCaptured}
                />
              )}

              {photoStage === 'preview' && photoDataUrl && (
                <>
                  <img src={photoDataUrl} alt="Recipe to import" className={styles.photoPreview} />
                  <div className={styles.qualityChecklist}>
                    <p className={styles.qualityTitle}>Before we read this, double check:</p>
                    <ul className={styles.photoTipsList}>
                      <li>Is the recipe text clearly visible and in focus?</li>
                      <li>Is the lighting good with no shadows over the text?</li>
                      <li>Is the entire recipe visible in the frame, including ingredients and instructions?</li>
                      <li>Is the photo taken straight on, not at an angle?</li>
                    </ul>
                  </div>
                  {error && <div className={styles.error}>{error}</div>}
                  <div className={styles.photoActionsRow}>
                    <button type="button" className={styles.btnCancel} onClick={resetPhoto} disabled={loading}>
                      Retake Photo
                    </button>
                    <button type="button" className={styles.btnImport} onClick={handlePhotoParse} disabled={loading}>
                      {loading ? 'Reading recipe…' : 'Looks Good — Parse Recipe'}
                    </button>
                  </div>
                </>
              )}

              {photoStage === 'lowConfidence' && (
                <div className={styles.lowConfidenceBox}>
                  <p className={styles.lowConfidenceTitle}>
                    ⚠️ We could not confidently read this recipe photo.
                  </p>
                  <p className={styles.lowConfidenceBody}>
                    This usually means the photo was blurry, too dark, at an angle, or the text was too small.
                    Please try again with a clearer photo.
                  </p>
                  {lowConfidenceReason && (
                    <p className={styles.lowConfidenceReason}>Gemini said: "{lowConfidenceReason}"</p>
                  )}
                  <div className={styles.photoActionsRow}>
                    <button type="button" className={styles.btnCancel} onClick={resetPhoto}>
                      Try Again with Better Photo
                    </button>
                    <button type="button" className={styles.btnImport} onClick={() => { onManualEntry(); onClose() }}>
                      Type Recipe Manually Instead
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'photo' && !photoConfigured && (
            <div className={styles.tabPane}>
              <div className={styles.noAiBox}>
                <p className={styles.noAiTitle}>A free Gemini key is required for Photo import</p>
                <p className={styles.noAiBody}>
                  Reading a recipe from a photo uses Google's Gemini vision AI, which is free to use.
                  Go to Settings → Integrations and enter your Gemini key, or visit the Help page for a
                  step-by-step guide to getting one at no cost.
                </p>
                <button className={styles.btnSettings} onClick={goToSettings}>
                  Go to Settings → Integrations
                </button>
                <button className={styles.btnSettings} onClick={goToHelp}>
                  Help — Getting a free Gemini key
                </button>
              </div>
            </div>
          )}

        </div>

        <footer className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Cancel
          </button>

          {/* AI URL import */}
          {tab === 'url' && aiConfigured && (
            <button className={styles.btnImport} onClick={handleUrlImport} disabled={loading || !url.trim()}>
              {loading ? 'Importing…' : 'Import from URL'}
            </button>
          )}

          {/* AI paste import */}
          {tab === 'paste' && aiConfigured && (
            <button className={styles.btnImport} onClick={handlePasteImport} disabled={loading || !pasteText.trim()}>
              {loading ? 'Parsing…' : 'Parse with AI'}
            </button>
          )}

          {/* No AI, paste → open as reference */}
          {tab === 'paste' && !aiConfigured && (
            <button
              className={styles.btnImport}
              onClick={() => { if (pasteText.trim()) { onManualWithReference(pasteText.trim()); onClose() } }}
              disabled={!pasteText.trim()}
            >
              Use as Reference While I Type →
            </button>
          )}
          {/* Photo tab: actions live inline in the pane above, footer only needs Cancel */}
        </footer>

        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              {tab === 'url' ? 'Fetching and parsing recipe…' : tab === 'photo' ? 'Reading recipe from photo…' : 'Parsing recipe text…'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
