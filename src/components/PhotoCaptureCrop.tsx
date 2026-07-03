import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, X } from 'lucide-react'
import ReactCrop, { centerCrop, makeAspectCrop, convertToPixelCrop, cropToCanvas, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import styles from './PhotoCaptureCrop.module.css'

type Stage = 'select' | 'webcam' | 'crop'

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
  /** Fires once with the final (possibly cropped) photo as a data URL. */
  onComplete: (dataUrl: string) => void
}

/**
 * Shared photo capture + crop pipeline: Take Photo (native camera on mobile,
 * live getUserMedia webcam on desktop) / Choose Photo / drag-drop / clipboard
 * paste, followed by a react-image-crop editor. Used by both the recipe photo
 * import tab and the ingredient label scanner so the two stay in sync.
 */
export function PhotoCaptureCrop({ primaryLabel, tipsTitle, tips, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('select')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const [webcamError, setWebcamError] = useState('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

  const [crop, setCrop] = useState<PixelCrop | undefined>(undefined)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined)
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement>(null)

  function resetCropState() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setCropAspect(undefined)
  }

  function loadPhotoFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string)
      resetCropState()
      setStage('crop')
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
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.92))
    resetCropState()
    setStage('crop')
  }

  function handleCancelWebcam() {
    stopWebcam()
    setStage('select')
  }

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
    if (photoDataUrl) onComplete(photoDataUrl)
  }

  async function handleApplyCrop() {
    const img = imgRef.current
    if (!img || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) {
      if (photoDataUrl) onComplete(photoDataUrl)
      return
    }
    const canvas = document.createElement('canvas')
    await cropToCanvas(img, canvas, completedCrop)
    onComplete(canvas.toDataURL('image/jpeg', 0.92))
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

      {stage === 'crop' && photoDataUrl && (
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
