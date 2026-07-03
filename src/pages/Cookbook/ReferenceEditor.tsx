import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bold, Italic, List, ListOrdered, Camera, Sparkles, X } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { PhotoCaptureCrop } from '@/components/PhotoCaptureCrop'
import { newId, now } from '@/utils/ids'
import type { KitchenReference, ReferenceContentType } from '@/types'
import { CONTENT_TYPES, CONTENT_TYPE_VALUES } from './referenceContentTypes'
import styles from './ReferenceEditor.module.css'

function blankTable(): string[][] {
  return [['', ''], ['', ''], ['', '']]
}

interface GeminiReferenceResult {
  title?: string
  contentType?: string
  content?: string
  tableData?: unknown
}

const PHOTO_TIPS = [
  'Place the page flat in good lighting',
  'Make sure all text is in focus and fully visible',
  'Take the photo straight on, not at an angle',
  'Crop to just the section you want to capture',
]

interface Props {
  reference?: KitchenReference
  onSave: (ref: KitchenReference) => void
  onClose: () => void
}

export function ReferenceEditor({ reference, onSave, onClose }: Props) {
  const { settings } = useSettings()
  const [title, setTitle] = useState(reference?.title ?? '')
  const [contentType, setContentType] = useState<ReferenceContentType>(reference?.contentType ?? 'tips')
  const [sourceTags, setSourceTags] = useState<string[]>(reference?.sourceTags ?? [])
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [content, setContent] = useState(reference?.content ?? '')
  const [tableMode, setTableMode] = useState(Boolean(reference?.tableData?.length))
  const [tableData, setTableData] = useState<string[][]>(reference?.tableData ?? blankTable())
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(reference?.photoUrl)
  const [showPhotoCapture, setShowPhotoCapture] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [lowConfidenceReason, setLowConfidenceReason] = useState<string | null>(null)
  const [photoDecisionPending, setPhotoDecisionPending] = useState(false)

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const hasGeminiKey = Boolean(settings.geminiApiKey)
  const sourceGroup = settings.recipeTags.find(g => g.group === 'Source')
  const availableSourceTags = (sourceGroup?.tags ?? []).filter(t => !sourceTags.includes(t))

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  useEffect(() => {
    if (!tagPickerOpen) return
    function handleOutside(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-tag-picker]')) setTagPickerOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [tagPickerOpen])

  function addTag(tag: string) {
    setSourceTags(prev => prev.includes(tag) ? prev : [...prev, tag])
    setTagPickerOpen(false)
  }
  function removeTag(tag: string) {
    setSourceTags(prev => prev.filter(t => t !== tag))
  }

  // ── Formatting toolbar ──────────────────────────────────────────────────
  function wrapSelection(prefix: string, suffix: string = prefix) {
    const el = contentRef.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const next = `${content.slice(0, s)}${prefix}${content.slice(s, e)}${suffix}${content.slice(e)}`
    setContent(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, e + prefix.length) })
  }

  function insertLinePrefix(prefix: string) {
    const el = contentRef.current
    if (!el) return
    const s = el.selectionStart
    const lineStart = content.lastIndexOf('\n', s - 1) + 1
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart)
    setContent(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length) })
  }

  // ── Table mode ───────────────────────────────────────────────────────────
  function updateCell(r: number, c: number, value: string) {
    setTableData(prev => prev.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? value : cell) : row))
  }
  function addRow() {
    setTableData(prev => [...prev, prev[0].map(() => '')])
  }
  function addColumn() {
    setTableData(prev => prev.map(row => [...row, '']))
  }
  function removeRow(r: number) {
    setTableData(prev => prev.length > 1 ? prev.filter((_, ri) => ri !== r) : prev)
  }
  function removeColumn(c: number) {
    setTableData(prev => prev[0].length > 1 ? prev.map(row => row.filter((_, ci) => ci !== c)) : prev)
  }

  // ── Photo capture + Gemini scan ──────────────────────────────────────────
  function handlePhotoCaptured(dataUrl: string) {
    setPhotoDataUrl(dataUrl)
    setShowPhotoCapture(false)
    setLowConfidenceReason('')
    setScanError('')
    setPhotoDecisionPending(false)
  }

  async function handleExtractText() {
    if (!photoDataUrl) return
    setScanError('')
    setLowConfidenceReason(null)
    setScanLoading(true)
    try {
      const commaIdx = photoDataUrl.indexOf(',')
      const base64 = photoDataUrl.slice(commaIdx + 1)
      const mimeMatch = photoDataUrl.slice(0, commaIdx).match(/data:(.*);base64/)
      const mimeType = mimeMatch?.[1] || 'image/jpeg'

      const res = await fetch('/api/gemini-reference-scan', {
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
        status?: number; reference?: GeminiReferenceResult; lowConfidence?: boolean; reason?: string; error?: string
      }

      if (!res.ok || json.error) {
        setScanError(json.error ?? 'Could not read this page. Try again.')
        return
      }
      if (json.lowConfidence || !json.reference) {
        setLowConfidenceReason(json.reason ?? 'The page was unclear.')
        return
      }

      const r = json.reference
      if (r.title) setTitle(r.title)
      if (typeof r.contentType === 'string' && CONTENT_TYPE_VALUES.includes(r.contentType as ReferenceContentType)) {
        setContentType(r.contentType as ReferenceContentType)
      }
      if (r.content) setContent(r.content)
      if (Array.isArray(r.tableData) && r.tableData.length > 0) {
        setTableMode(true)
        setTableData(r.tableData.map(row => Array.isArray(row) ? row.map(cell => String(cell)) : []))
      }

      // What happens to the original photo after a successful extraction is
      // governed by the household's Kitchen Reference Photos preference —
      // only "ask" shows the keep/discard prompt below the photo.
      const policy = settings.kitchenReferencePhotoPolicy ?? 'ask'
      if (policy === 'discard') {
        setPhotoDataUrl(undefined)
      } else if (policy === 'ask') {
        setPhotoDecisionPending(true)
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not read this page. Try again.')
    } finally {
      setScanLoading(false)
    }
  }

  function handleKeepPhoto() {
    setPhotoDecisionPending(false)
  }

  function handleDiscardPhoto() {
    setPhotoDataUrl(undefined)
    setPhotoDecisionPending(false)
  }

  function handleSave() {
    if (!title.trim()) return
    const saved: KitchenReference = {
      id: reference?.id ?? newId(),
      title: title.trim(),
      contentType,
      sourceTags,
      content,
      tableData: tableMode ? tableData : undefined,
      photoUrl: photoDataUrl,
      createdAt: reference?.createdAt ?? now(),
      updatedAt: now(),
    }
    onSave(saved)
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{reference ? 'Edit Reference' : 'Add Reference'}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Herb Substitution Guide"
              autoFocus
            />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Content Type</span>
            <div className={styles.typeGrid}>
              {CONTENT_TYPES.map(ct => (
                <button
                  key={ct.value}
                  type="button"
                  className={`${styles.typeBtn} ${contentType === ct.value ? styles.typeBtnActive : ''}`}
                  onClick={() => setContentType(ct.value)}
                >
                  <ct.Icon size={15} />
                  <span>{ct.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Source Tags</span>
            <div className={styles.tagRow}>
              {sourceTags.map(tag => (
                <span key={tag} className={styles.tagChip}>
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>×</button>
                </span>
              ))}
              <div className={styles.tagAddWrap} data-tag-picker>
                <button type="button" className={styles.tagAddBtn} onClick={() => setTagPickerOpen(v => !v)}>
                  + Add Source
                </button>
                {tagPickerOpen && (
                  <ul className={styles.tagDropdown}>
                    {availableSourceTags.length === 0
                      ? <li className={styles.tagDropdownEmpty}>No more source tags</li>
                      : availableSourceTags.map(tag => (
                        <li key={tag}>
                          <button type="button" onMouseDown={() => addTag(tag)}>{tag}</button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.contentHeader}>
              <span className={styles.fieldLabel}>Content</span>
              <button type="button" className={styles.tableModeToggle} onClick={() => setTableMode(v => !v)}>
                {tableMode ? 'Switch to Text' : 'Switch to Table'}
              </button>
            </div>

            {!tableMode ? (
              <>
                <div className={styles.toolbar}>
                  <button type="button" onClick={() => wrapSelection('**')} title="Bold"><Bold size={14} /></button>
                  <button type="button" onClick={() => wrapSelection('_')} title="Italic"><Italic size={14} /></button>
                  <button type="button" onClick={() => insertLinePrefix('• ')} title="Bullet list"><List size={14} /></button>
                  <button type="button" onClick={() => insertLinePrefix('1. ')} title="Numbered list"><ListOrdered size={14} /></button>
                </div>
                <textarea
                  ref={contentRef}
                  className={styles.contentArea}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Write your reference content here…"
                  rows={10}
                />
              </>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <tbody>
                    {tableData.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>
                            <input
                              type="text"
                              className={styles.tableCell}
                              value={cell}
                              onChange={e => updateCell(r, c, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className={styles.tableRowActions}>
                          <button type="button" onClick={() => removeRow(r)} aria-label="Remove row">×</button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      {tableData[0]?.map((_, c) => (
                        <td key={c} className={styles.tableColActions}>
                          <button type="button" onClick={() => removeColumn(c)} aria-label="Remove column">×</button>
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tbody>
                </table>
                <div className={styles.tableBtns}>
                  <button type="button" className={styles.tableAddBtn} onClick={addRow}>+ Row</button>
                  <button type="button" className={styles.tableAddBtn} onClick={addColumn}>+ Column</button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Photo (optional)</span>
            {photoDataUrl ? (
              <div className={styles.photoPreviewWrap}>
                <img src={photoDataUrl} alt="Reference page" className={styles.photoPreview} />

                {photoDecisionPending ? (
                  <div className={styles.photoDecision}>
                    <p className={styles.photoDecisionQuestion}>
                      Would you like to keep the original photo with this reference entry?
                    </p>
                    <div className={styles.photoActions}>
                      <button type="button" className={styles.btnSecondary} onClick={handleKeepPhoto}>
                        Keep Photo
                      </button>
                      <button type="button" className={styles.btnPrimary} onClick={handleDiscardPhoto} autoFocus>
                        Text Only — Discard Photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.photoActions}>
                      <button type="button" className={styles.btnSecondary} onClick={() => setShowPhotoCapture(true)}>
                        Retake
                      </button>
                      <button type="button" className={styles.btnSecondary} onClick={() => { setPhotoDataUrl(undefined); setPhotoDecisionPending(false) }}>
                        <X size={13} style={{ verticalAlign: 'middle', marginRight: 2 }} />Remove
                      </button>
                      {hasGeminiKey && (
                        <button type="button" className={styles.btnPrimary} onClick={handleExtractText} disabled={scanLoading}>
                          <Sparkles size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          {scanLoading ? 'Reading page…' : 'Extract Text with Gemini'}
                        </button>
                      )}
                    </div>
                    {scanError && <p className={styles.scanError}>{scanError}</p>}
                    {lowConfidenceReason && (
                      <p className={styles.scanLowConfidence}>
                        ⚠️ Could not read this page clearly{lowConfidenceReason ? `: ${lowConfidenceReason}` : '.'} Try a clearer photo, or fill in the fields manually.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <button type="button" className={styles.attachPhotoBtn} onClick={() => setShowPhotoCapture(true)}>
                <Camera size={16} /> Take Photo or Scan Page
              </button>
            )}
          </div>

          {showPhotoCapture && (
            <div className={styles.captureOverlay}>
              <PhotoCaptureCrop
                primaryLabel="Take Photo or Scan Page"
                tipsTitle="📸 Tips for scanning reference pages:"
                tips={PHOTO_TIPS}
                onComplete={handlePhotoCaptured}
              />
              <button type="button" className={styles.btnSecondary} onClick={() => setShowPhotoCapture(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={!title.trim()}>
            Save Reference
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
