import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Image as ImageIcon, X } from 'lucide-react'
import ReactCrop, { centerCrop, makeAspectCrop, convertToPixelCrop, cropToCanvas, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useSettings } from '@/context/SettingsContext'
import {
  importRecipeFromUrl, importRecipeFromText, importRecipeFromPhoto,
  isRecipeImportAvailable, effectiveRecipeAI, recipeAILabel,
  isPhotoImportAvailable, effectivePhotoGeminiKey,
} from '@/utils/aiImport'
import type { AIRecipeResult, UncertainField } from '@/utils/aiImport'
import type { ImportNotice } from './RecipeEditor'
import styles from './RecipeImportModal.module.css'

type Tab = 'url' | 'paste' | 'photo'
type PhotoStage = 'select' | 'webcam' | 'crop' | 'preview' | 'lowConfidence'

type AspectPreset = { label: string; value: number | undefined }
const CROP_PRESETS: AspectPreset[] = [
  { label: 'Free', value: undefined },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
]

// Standard, reliable way to tell "is this a phone" — far more consistent across
// browsers than feature/pointer-based heuristics (which failed on real iPhones).
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

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
  const [photoStage, setPhotoStage] = useState<PhotoStage>('select')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const [lowConfidenceReason, setLowConfidenceReason] = useState('')
  const [webcamError, setWebcamError] = useState('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

  // Crop stage state
  const [crop, setCrop] = useState<PixelCrop | undefined>(undefined)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined)
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement>(null)

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

  function resetCropState() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setCropAspect(undefined)
  }

  function loadPhotoFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string)
      resetCropState()
      setPhotoStage('crop')
    }
    reader.readAsDataURL(file)
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    loadPhotoFile(e.target.files?.[0])
    e.target.value = ''
  }

  function handlePhotoDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDraggingPhoto(false)
    loadPhotoFile(e.dataTransfer.files?.[0])
  }

  // Desktop Ctrl+V: paste an image straight from the clipboard while the photo
  // tab's picker is showing (screenshots, copied images, etc).
  useEffect(() => {
    if (tab !== 'photo' || photoStage !== 'select') return
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) loadPhotoFile(file)
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [tab, photoStage])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Webcam capture (desktop) ──────────────────────────────────────────────

  function stopWebcam() {
    webcamStreamRef.current?.getTracks().forEach(t => t.stop())
    webcamStreamRef.current = null
  }

  // Release the camera if the modal is closed while the webcam is still open.
  useEffect(() => () => stopWebcam(), [])

  useEffect(() => {
    if (photoStage === 'webcam' && videoRef.current && webcamStreamRef.current) {
      videoRef.current.srcObject = webcamStreamRef.current
    }
  }, [photoStage])

  async function handleTakePhotoClick() {
    setWebcamError('')

    // Phones/tablets: the native camera app (via capture="environment") gives
    // a better result than an in-page webcam widget — keep using it there.
    if (isMobileDevice()) {
      cameraInputRef.current?.click()
      return
    }

    // Desktop: live webcam preview via getUserMedia, falling back to the file
    // picker (the same hidden input, which desktop browsers treat as a plain
    // file picker since they ignore capture="environment") if unavailable.
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Your browser does not support camera access. Use Choose from Library or drag and drop a photo instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      webcamStreamRef.current = stream
      setPhotoStage('webcam')
    } catch {
      setWebcamError('Could not access your camera — it may be in use by another app, blocked, or unavailable. Use Choose from Library or drag and drop a photo instead.')
    }
  }

  function handleCapturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    stopWebcam()
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.92))
    resetCropState()
    setPhotoStage('crop')
  }

  function handleCancelWebcam() {
    stopWebcam()
    setPhotoStage('select')
  }

  // ── Crop stage ─────────────────────────────────────────────────────────────

  function onCropImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    applyCropAspect(cropAspect, width, height)
  }

  function applyCropAspect(aspect: number | undefined, widthArg?: number, heightArg?: number) {
    const width = widthArg ?? imgRef.current?.width
    const height = heightArg ?? imgRef.current?.height
    if (!width || !height) return
    setCropAspect(aspect)
    const percentCrop = aspect
      ? centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height)
      : { unit: '%' as const, x: 5, y: 5, width: 90, height: 90 }
    const pixelCrop = convertToPixelCrop(percentCrop, width, height)
    setCrop(pixelCrop)
    setCompletedCrop(pixelCrop)
  }

  function handleUseFullPhoto() {
    resetCropState()
    setPhotoStage('preview')
  }

  async function handleApplyCrop() {
    const img = imgRef.current
    if (!img || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) {
      setPhotoStage('preview')
      return
    }
    const canvas = document.createElement('canvas')
    await cropToCanvas(img, canvas, completedCrop)
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.92))
    setPhotoStage('preview')
  }

  function resetPhoto() {
    stopWebcam()
    setPhotoDataUrl(null)
    resetCropState()
    setWebcamError('')
    setPhotoStage('select')
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

  // Crop selection shown to the user, scaled from the displayed <img> size up
  // to the photo's natural resolution (what actually gets cropped/sent).
  const cropPixelDims = completedCrop && imgRef.current && imgRef.current.width > 0
    ? {
        width: Math.round(completedCrop.width * (imgRef.current.naturalWidth / imgRef.current.width)),
        height: Math.round(completedCrop.height * (imgRef.current.naturalHeight / imgRef.current.height)),
      }
    : null

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

              {photoStage === 'select' && (
                <>
                  {/* Mobile: opens the native camera app via capture="environment"
                      (handled below). Desktop: opens a live webcam preview via
                      getUserMedia, falling back to the file picker if that's
                      unavailable or denied. Either way this is the primary action. */}
                  <button
                    type="button"
                    className={styles.btnTakePhoto}
                    onClick={handleTakePhotoClick}
                  >
                    <Camera size={20} /> Take Photo or Scan Recipe
                  </button>

                  {webcamError && <div className={styles.error}>{webcamError}</div>}

                  <div
                    className={`${styles.dropzone} ${isDraggingPhoto ? styles.dropzoneActive : ''}`}
                    onDragOver={e => { e.preventDefault(); setIsDraggingPhoto(true) }}
                    onDragLeave={() => setIsDraggingPhoto(false)}
                    onDrop={handlePhotoDrop}
                  >
                    <p className={styles.dropzoneText}>Or drag and drop / paste a recipe photo here</p>
                    <div className={styles.photoButtons}>
                      <button
                        type="button"
                        className={styles.btnPhotoActionSecondary}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImageIcon size={18} /> Choose from Library
                      </button>
                    </div>
                  </div>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoInputChange}
                    className={styles.hiddenFileInput}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoInputChange}
                    className={styles.hiddenFileInput}
                  />

                  <div className={styles.photoTips}>
                    <p className={styles.photoTipsTitle}>📸 Tips for best results:</p>
                    <ul className={styles.photoTipsList}>
                      <li>Place the recipe on a flat surface in good lighting</li>
                      <li>Make sure all text is in focus and fully visible</li>
                      <li>Take the photo straight on, not at an angle</li>
                      <li>If the recipe spans multiple pages, take one photo per page and import separately</li>
                      <li>Handwritten recipes work, but printed recipes give better results</li>
                    </ul>
                  </div>
                </>
              )}

              {photoStage === 'webcam' && (
                <div className={styles.webcamStage}>
                  <video ref={videoRef} autoPlay playsInline muted className={styles.webcamVideo} />
                  <div className={styles.photoActionsRow}>
                    <button type="button" className={styles.btnCancel} onClick={handleCancelWebcam}>
                      Cancel
                    </button>
                    <button type="button" className={styles.btnImport} onClick={handleCapturePhoto}>
                      <Camera size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                      Capture
                    </button>
                  </div>
                </div>
              )}

              {photoStage === 'crop' && photoDataUrl && (
                <div className={styles.cropStage}>
                  <div className={styles.cropAspectRow}>
                    <span className={styles.cropAspectLabel}>Crop to:</span>
                    {CROP_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        className={`${styles.cropAspectBtn} ${cropAspect === preset.value ? styles.cropAspectBtnActive : ''}`}
                        onClick={() => applyCropAspect(preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.cropImageWrap}>
                    <ReactCrop
                      crop={crop}
                      onChange={pixelCrop => setCrop(pixelCrop)}
                      onComplete={pixelCrop => setCompletedCrop(pixelCrop)}
                      aspect={cropAspect}
                      minWidth={20}
                      minHeight={20}
                    >
                      <img
                        ref={imgRef}
                        src={photoDataUrl}
                        alt="Recipe to crop"
                        onLoad={onCropImageLoad}
                        className={styles.cropImage}
                      />
                    </ReactCrop>
                  </div>

                  {cropPixelDims && (
                    <p className={styles.cropDimensions}>
                      Selection: {cropPixelDims.width} × {cropPixelDims.height} px
                    </p>
                  )}

                  <div className={styles.photoActionsRow}>
                    <button type="button" className={styles.btnCancel} onClick={resetPhoto}>
                      <X size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Back
                    </button>
                    <button type="button" className={styles.btnPhotoActionSecondary} onClick={handleUseFullPhoto}>
                      Use Full Photo
                    </button>
                    <button type="button" className={styles.btnImport} onClick={handleApplyCrop}>
                      Apply Crop
                    </button>
                  </div>
                </div>
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
