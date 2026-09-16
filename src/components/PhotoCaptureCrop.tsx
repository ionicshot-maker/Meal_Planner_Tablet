import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, X } from 'lucide-react'
import ReactCrop, { centerCrop, makeAspectCrop, convertToPixelCrop, cropToCanvas, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import styles from './PhotoCaptureCrop.module.css'

type Stage = 'select' | 'webcam' | 'crop'

/** A crop region expressed as percentages (0-100) of the full photo's width/height. */
export interface CropBoxPercent {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

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
  /** Text on the big primary button, e.g. "Take Photo or Scan Recipe". */
  primaryLabel: string
  tipsTitle: string
  tips: string[]
  /**
   * Fires once with the final (possibly cropped) photo as a data URL, plus
   * the original, un-cropped acquisition — callers that only need the
   * result (the common case) can ignore the second argument.
   */
  onComplete: (dataUrl: string, originalPhotoDataUrl: string) => void
  /**
   * Phase 2C-2 — fires once, the instant a photo is acquired (Take Photo,
   * Choose Photo, drag-drop, or clipboard paste), immediately before the
   * crop stage renders. Lets a caller kick off boundary detection as early
   * as possible without blocking the crop screen from appearing right away.
   * Deliberately NOT fired for the `initialPhotoDataUrl`-seeded re-entry path
   * ("crop another recipe from this same photo") — that path already has a
   * photo and isn't a new acquisition, so callers that key detection off
   * this event naturally get it exactly once per genuinely new photo.
   */
  onPhotoSelected?: (dataUrl: string) => void
  /**
   * Pre-seeds the pipeline with an already-acquired photo and starts
   * directly at the crop stage, skipping Take Photo/Choose Photo entirely —
   * lets a caller re-enter cropping against a photo it already has (e.g.
   * cropping a second recipe from the same source photo) without asking the
   * user to re-acquire it. Omitted/undefined reproduces today's exact
   * stage: 'select' / photoDataUrl: null starting behavior.
   */
  initialPhotoDataUrl?: string
  /**
   * Pre-seeds the crop stage's starting selection (Phase 2C-1 — AI-detected
   * recipe boundaries) instead of today's default centered selection.
   * Consumed once, inside the same rendered-dimensions callback that already
   * computes the default crop (`onCropImageLoad`) — a plain useState default
   * won't work here the way `initialPhotoDataUrl` does, since converting a
   * percent box to a pixel crop needs the <img>'s *rendered* size, which
   * only exists after it mounts and loads. Omitted/undefined reproduces
   * today's exact default-crop behavior, unchanged.
   *
   * Phase 2C-2 update: this can now also arrive *after* the crop stage has
   * already mounted (recipe #1's box is opportunistic — detection may still
   * be in flight when the crop screen first appears). A change to this prop
   * is applied the same way as the initial value, UNLESS the user has
   * already interacted with the crop (see `hasUserInteractedWithCrop`
   * below) — an in-progress manual crop is never silently overwritten.
   */
  initialCropBox?: CropBoxPercent
}

// Gemini's suggested box is a starting point, not guaranteed to land neatly
// inside the photo — clamp so the seeded selection is always fully visible
// and never degenerates to an unusably thin sliver.
const MIN_BOX_PCT = 5

function clampCropBox(box: CropBoxPercent): { x: number; y: number; width: number; height: number } {
  const x = Math.min(Math.max(box.leftPct, 0), 100 - MIN_BOX_PCT)
  const y = Math.min(Math.max(box.topPct, 0), 100 - MIN_BOX_PCT)
  const width = Math.min(Math.max(box.widthPct, MIN_BOX_PCT), 100 - x)
  const height = Math.min(Math.max(box.heightPct, MIN_BOX_PCT), 100 - y)
  return { x, y, width, height }
}

// Bug fix (Phase 2C-1, live since 2026-07-27): the deployed detection model
// (gemini-3.1-flash-lite) reliably returns leftPct/widthPct/heightPct on a
// 0-1000 scale instead of the requested 0-100 scale, confirmed reproducible
// across 48 boxes / 18 responses / 6 photos in dedicated investigation.
// Un-normalized, these values silently clamp (via clampCropBox above) to a
// degenerate sliver pinned to the bottom-right corner — no error, no crash,
// just a useless suggestion. A CONDITIONAL "if this field > 100" per-field
// check is provably unsafe: topPct is *naturally* small for boxes near the
// top of a page in either scale (confirmed in ~25% of a real sample), so a
// per-field trigger leaves topPct uncorrected while the other three fields
// get corrected, producing a confidently wrong box on the wrong recipe
// entirely — worse than doing nothing. The only safe trigger is checking
// leftPct/widthPct/heightPct (never topPct alone) at the *response* level,
// then normalizing every field of every box in that response together.
//
// This must run once per full detection response (all boxes for a photo),
// not per box in isolation — a mix of normalized and un-normalized boxes
// in the same photo's queue would be worse than either state uniformly.
// Colocated here with clampCropBox since they're one conceptual pipeline,
// but called from CookbookPage.tsx where the full response array actually
// exists — PhotoCaptureCrop itself only ever receives one already-selected
// box (`initialCropBox`), never the full list, so the response-level
// decision cannot be made at the point clampCropBox runs.
const MIN_SANE_BOX_PCT = 2

export function normalizeDetectionResponse(boxes: CropBoxPercent[]): (CropBoxPercent | null)[] {
  // Step 1 — response-level scale normalization. Never trigger on topPct alone.
  const isInflated = boxes.some(b => b.leftPct > 100 || b.widthPct > 100 || b.heightPct > 100)
  const scaled = isInflated
    ? boxes.map(b => ({ leftPct: b.leftPct / 10, topPct: b.topPct / 10, widthPct: b.widthPct / 10, heightPct: b.heightPct / 10 }))
    : boxes

  // Step 2 (per box, geometric clamp) + Step 3 (per box, discard if unresolvable).
  return scaled.map((b): CropBoxPercent | null => {
    const { leftPct, topPct, widthPct, heightPct } = b
    if (![leftPct, topPct, widthPct, heightPct].every(Number.isFinite)) return null
    if (leftPct < 0 || topPct < 0 || widthPct <= 0 || heightPct <= 0) return null
    if (leftPct >= 100 || topPct >= 100) return null

    let width = widthPct
    let height = heightPct
    if (leftPct + width > 100) width = 100 - leftPct
    if (topPct + height > 100) height = 100 - topPct

    if (width < MIN_SANE_BOX_PCT || height < MIN_SANE_BOX_PCT) return null

    return { leftPct, topPct, widthPct: width, heightPct: height }
  })
}

/**
 * Shared photo capture + crop pipeline: Take Photo (native camera on mobile,
 * live getUserMedia webcam on desktop) / Choose Photo / drag-drop / clipboard
 * paste, followed by a react-image-crop editor. Used by both the recipe photo
 * import tab and the ingredient label scanner so the two stay in sync.
 */
export function PhotoCaptureCrop({ primaryLabel, tipsTitle, tips, onComplete, onPhotoSelected, initialPhotoDataUrl, initialCropBox }: Props) {
  const [stage, setStage] = useState<Stage>(initialPhotoDataUrl ? 'crop' : 'select')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initialPhotoDataUrl ?? null)
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const [webcamError, setWebcamError] = useState('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

  const [crop, setCrop] = useState<PixelCrop | undefined>(undefined)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined)
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined)
  // Phase 2C-2 — explicit interaction tracking for the suggestion-race rule:
  // an arriving/pending suggestion must never overwrite a crop the user has
  // already started adjusting. Deliberately a real flag, not inferred from
  // crop position — the *default* crop is itself just as much "not yet
  // touched" as a freshly-arrived suggestion, so position alone can't tell
  // the two apart.
  const [hasUserInteractedWithCrop, setHasUserInteractedWithCrop] = useState(false)
  // Whether the crop currently showing came from a detection suggestion
  // (vs. today's default full-frame/aspect crop) — drives the tentative
  // visual treatment. Combined with `!hasUserInteractedWithCrop` and (at the
  // call site) "this is a fresh photo, not a crop-another re-entry" to decide
  // when to show it.
  const [cropCameFromSuggestion, setCropCameFromSuggestion] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  // The webcam/crop stages can appear far down an already-scrolled-past
  // capture form (title, tags, content fields, etc. above them) — bring the
  // stage (and its action buttons) into view instead of leaving the user to
  // discover they need to scroll further.
  useEffect(() => {
    if (stage === 'crop' || stage === 'webcam') {
      stageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [stage])

  function resetCropState() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setCropAspect(undefined)
    setHasUserInteractedWithCrop(false)
    setCropCameFromSuggestion(false)
  }

  function loadPhotoFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setPhotoDataUrl(dataUrl)
      resetCropState()
      setStage('crop')
      onPhotoSelected?.(dataUrl)
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

  // Desktop Ctrl+V: paste an image straight from the clipboard while the
  // picker is showing (screenshots, copied images, etc).
  useEffect(() => {
    if (stage !== 'select') return
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
  }, [stage])  // eslint-disable-line react-hooks/exhaustive-deps

  function stopWebcam() {
    webcamStreamRef.current?.getTracks().forEach(t => t.stop())
    webcamStreamRef.current = null
  }

  // Release the camera if the component unmounts while the webcam is open.
  useEffect(() => () => stopWebcam(), [])

  useEffect(() => {
    if (stage === 'webcam' && videoRef.current && webcamStreamRef.current) {
      videoRef.current.srcObject = webcamStreamRef.current
    }
  }, [stage])

  async function handleTakePhotoClick() {
    setWebcamError('')

    // Phones/tablets: the native camera app (via capture="environment") gives
    // a better result than an in-page webcam widget — keep using it there.
    if (isMobileDevice()) {
      cameraInputRef.current?.click()
      return
    }

    // Desktop: live webcam preview via getUserMedia, falling back to the file
    // picker if unavailable or denied.
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Your browser does not support camera access. Use Choose Photo or drag and drop a photo instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      webcamStreamRef.current = stream
      setStage('webcam')
    } catch {
      setWebcamError('Could not access your camera — it may be in use by another app, blocked, or unavailable. Use Choose Photo or drag and drop a photo instead.')
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPhotoDataUrl(dataUrl)
    resetCropState()
    setStage('crop')
    onPhotoSelected?.(dataUrl)
  }

  function handleCancelWebcam() {
    stopWebcam()
    setStage('select')
  }

  // Shared by the initial application (onCropImageLoad) and the late-arrival
  // effect below — converts a suggested percent box to a pixel crop against
  // the image's *rendered* dimensions and marks it as suggestion-derived
  // (drives the tentative visual treatment at the call site).
  function applySuggestedBox(box: CropBoxPercent, width: number, height: number) {
    const { x, y, width: boxWidth, height: boxHeight } = clampCropBox(box)
    const pixelCrop = convertToPixelCrop({ unit: '%', x, y, width: boxWidth, height: boxHeight }, width, height)
    setCrop(pixelCrop)
    setCompletedCrop(pixelCrop)
    setCropCameFromSuggestion(true)
  }

  function onCropImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    if (initialCropBox) {
      applySuggestedBox(initialCropBox, width, height)
      return
    }
    applyCropAspect(cropAspect, width, height)
  }

  // Phase 2C-2 — recipe #1's suggestion is opportunistic: the crop screen
  // renders immediately (via onCropImageLoad's default-crop fallback above),
  // and a box may arrive *after* that, once detection resolves. Re-applies
  // it the same way, unless the user has already started adjusting the crop
  // — never overwrite in-progress user input. Guarded on the image already
  // being loaded (`imgRef.current.width`); if it isn't yet, onCropImageLoad
  // will apply whatever `initialCropBox` holds once it does load, so there's
  // no coverage gap. Intentionally reactive to `initialCropBox` only — it
  // only ever needs to act at the moment a *new* suggestion arrives, and the
  // interaction/image-loaded checks read their current values at that exact
  // moment regardless of whether they're listed as dependencies.
  useEffect(() => {
    if (!initialCropBox) return
    if (hasUserInteractedWithCrop) return
    const img = imgRef.current
    if (!img || !img.width) return
    applySuggestedBox(initialCropBox, img.width, img.height)
  }, [initialCropBox]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyCropAspect(aspect: number | undefined, widthArg?: number, heightArg?: number) {
    const width = widthArg ?? imgRef.current?.width
    const height = heightArg ?? imgRef.current?.height
    if (!width || !height) return
    setCropAspect(aspect)
    setCropCameFromSuggestion(false)
    const percentCrop = aspect
      ? centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height)
      : { unit: '%' as const, x: 5, y: 5, width: 90, height: 90 }
    const pixelCrop = convertToPixelCrop(percentCrop, width, height)
    setCrop(pixelCrop)
    setCompletedCrop(pixelCrop)
  }

  function handleUseFullPhoto() {
    if (photoDataUrl) onComplete(photoDataUrl, photoDataUrl)
  }

  async function handleApplyCrop() {
    const img = imgRef.current
    if (!img || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) {
      if (photoDataUrl) onComplete(photoDataUrl, photoDataUrl)
      return
    }
    const canvas = document.createElement('canvas')
    await cropToCanvas(img, canvas, completedCrop)
    if (photoDataUrl) onComplete(canvas.toDataURL('image/jpeg', 0.92), photoDataUrl)
  }

  function handleBackFromCrop() {
    setPhotoDataUrl(null)
    resetCropState()
    setStage('select')
  }

  // Crop selection shown to the user, scaled from the displayed <img> size up
  // to the photo's natural resolution (what actually gets cropped/sent).
  const cropPixelDims = completedCrop && imgRef.current && imgRef.current.width > 0
    ? {
        width: Math.round(completedCrop.width * (imgRef.current.naturalWidth / imgRef.current.width)),
        height: Math.round(completedCrop.height * (imgRef.current.naturalHeight / imgRef.current.height)),
      }
    : null

  // Phase 2C-2 — visually-tentative treatment is recipe-#1-specific only
  // (evidence: a dedicated re-run of box #1 quality against the real shipped
  // pipeline found a 25% misleading rate — 2/8 pages included the next
  // recipe's title/first ingredient — too high to present as "confirmed
  // correct"). `initialPhotoDataUrl` is absent only for a genuinely fresh
  // photo acquisition (recipe #1); a "crop another" re-entry (recipe #2+,
  // Phase 2C-1's existing suggestion styling, deliberately unchanged) always
  // supplies it. Also false once the user has touched the crop, or when the
  // current crop is today's ordinary default (no suggestion ever arrived/was
  // usable) — this is never shown for a default crop.
  const showTentativeBadge = !initialPhotoDataUrl && cropCameFromSuggestion && !hasUserInteractedWithCrop

  return (
    <>
      {stage === 'select' && (
        <>
          <button
            type="button"
            className={styles.btnTakePhoto}
            onClick={handleTakePhotoClick}
          >
            <Camera size={20} /> {primaryLabel}
          </button>

          {webcamError && <div className={styles.error}>{webcamError}</div>}

          <div
            className={`${styles.dropzone} ${isDraggingPhoto ? styles.dropzoneActive : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDraggingPhoto(true) }}
            onDragLeave={() => setIsDraggingPhoto(false)}
            onDrop={handlePhotoDrop}
          >
            <p className={styles.dropzoneText}>Or drag and drop / paste a photo here</p>
            <div className={styles.photoButtons}>
              <button
                type="button"
                className={styles.btnPhotoActionSecondary}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon size={18} /> Choose Photo
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
            <p className={styles.photoTipsTitle}>{tipsTitle}</p>
            <ul className={styles.photoTipsList}>
              {tips.map((tip, i) => <li key={i}>{tip}</li>)}
            </ul>
          </div>
        </>
      )}

      {stage === 'webcam' && (
        <div className={styles.webcamStage} ref={stageRef}>
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

      {stage === 'crop' && photoDataUrl && (
        <div className={styles.cropStage} ref={stageRef}>
          <div className={styles.cropAspectRow}>
            <span className={styles.cropAspectLabel}>Crop to:</span>
            {CROP_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                className={`${styles.cropAspectBtn} ${cropAspect === preset.value ? styles.cropAspectBtnActive : ''}`}
                onClick={() => { setHasUserInteractedWithCrop(true); applyCropAspect(preset.value) }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className={styles.cropImageWrap}>
            {showTentativeBadge && (
              <p className={styles.suggestedBoxLabel}>✨ Suggested crop — please check the boundaries</p>
            )}
            <ReactCrop
              crop={crop}
              onChange={pixelCrop => { setHasUserInteractedWithCrop(true); setCrop(pixelCrop) }}
              onComplete={pixelCrop => setCompletedCrop(pixelCrop)}
              aspect={cropAspect}
              minWidth={20}
              minHeight={20}
              className={showTentativeBadge ? styles.tentativeSuggestion : undefined}
            >
              <img
                ref={imgRef}
                src={photoDataUrl}
                alt="Photo to crop"
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
            <button type="button" className={styles.btnCancel} onClick={handleBackFromCrop}>
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
    </>
  )
}
