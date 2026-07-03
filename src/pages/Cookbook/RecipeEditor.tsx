import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link, Link2, Link2Off } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { Button, Toggle } from '@/components/ui'
import { IngredientPicker } from './IngredientPicker'
import type { PickedIngredient } from './IngredientPicker'
import { IngredientLinkModal } from './IngredientLinkModal'
import { getAllIngredients } from '@/db/ingredients'
import { buildIngredientMap, calcRecipeMacros, calcRecipeCost, normalizeUnit, formatMacro } from '@/utils/recipeCalculations'
import { availableUnits, parseTimeToMinutes, formatMinutes } from '@/utils/units'
import { newId, now } from '@/utils/ids'
import { scoreIngredientMatch } from '@/utils/ingredientMatch'
import type { Recipe, RecipeIngredient, RecipeStep, Ingredient, IngredientVariant, IngredientUnit } from '@/types'
import type { AIRecipeResult, UncertainField } from '@/utils/aiImport'
import styles from './RecipeEditor.module.css'

// ─── Auto-expanding textarea for step instructions ────────────────────────────

function StepTextarea({ stepId, value, placeholder, onChange, onKeyDown }: {
  stepId: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])

  return (
    <textarea
      ref={ref}
      className={styles.stepText}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      data-step-id={stepId}
      placeholder={placeholder}
    />
  )
}

// ─── Draft ingredient row (supports unlinked missing ingredients) ─────────────
interface DraftIngRow {
  _rowId: string
  ingredientId?: string   // undefined = missing / unlinked
  variantId?: string
  name: string            // always present for display
  quantity: number
  unit: IngredientUnit
  servingDisplay: string
}

export interface ImportNotice {
  level: 'success' | 'warning'
  message: string
  subMessage?: string
}

interface Props {
  recipe?: Recipe                  // undefined = new
  prefill?: AIRecipeResult         // from AI import
  fromImport?: boolean             // show review banner + clear button
  importNotice?: ImportNotice      // overrides the generic import banner text/styling
  uncertainFields?: UncertainField[] // fields the AI could not read confidently — highlighted in amber
  referenceText?: string           // side-by-side text reference (no-AI paste mode)
  onSave: (recipe: Recipe) => Promise<void>
  onClose: () => void
}

function recipeToRows(recipe: Recipe, ingredientMap: Map<string, Ingredient>): DraftIngRow[] {
  return recipe.ingredients.map(ri => {
    const ing = ri.ingredientId ? ingredientMap.get(ri.ingredientId) : undefined
    return {
      _rowId: newId(),
      ingredientId: ri.ingredientId,
      variantId: ri.variantId,
      name: ing?.name ?? ri.name,
      quantity: ri.quantity,
      unit: ri.unit,
      servingDisplay: ri.servingDisplay ?? '',
    }
  })
}

function rowsToIngredients(rows: DraftIngRow[]): RecipeIngredient[] {
  return rows
    .filter(r => r.name.trim())
    .map(r => ({
      ingredientId: r.ingredientId,
      variantId: r.variantId,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      servingDisplay: r.servingDisplay || undefined,
    }))
}

export function RecipeEditor({ recipe, prefill, fromImport, importNotice, uncertainFields: uncertainFieldsProp, referenceText, onSave, onClose }: Props) {
  const { settings } = useSettings()
  const isNew = !recipe?.id

  // Fields the AI couldn't read confidently — highlighted in amber until fixed
  const uncertainFields = useMemo(() => new Set(uncertainFieldsProp ?? []), [uncertainFieldsProp])

  // All ingredients from DB (for macro calc)
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const ingredientMap = buildIngredientMap(allIngredients)

  // Core recipe fields
  const [name, setName]           = useState(recipe?.name ?? prefill?.name ?? '')
  const [servings, setServings]   = useState(recipe?.servings ?? prefill?.servings ?? 4)
  const [prepInput, setPrepInput] = useState(recipe ? formatMinutes(recipe.prepTimeMinutes) : prefill ? formatMinutes(prefill.prepTimeMinutes) : '')
  const [cookInput, setCookInput] = useState(recipe ? formatMinutes(recipe.cookTimeMinutes) : prefill ? formatMinutes(prefill.cookTimeMinutes) : '')
  const [prepMin, setPrepMin]     = useState(recipe?.prepTimeMinutes ?? prefill?.prepTimeMinutes ?? 0)
  const [cookMin, setCookMin]     = useState(recipe?.cookTimeMinutes ?? prefill?.cookTimeMinutes ?? 0)
  const [notes, setNotes]         = useState(recipe?.notes ?? prefill?.notes ?? '')
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl ?? prefill?.sourceUrl ?? '')
  const [sourceName, setSourceName] = useState(recipe?.sourceName ?? prefill?.sourceName ?? '')
  const [isFavorite, setIsFavorite] = useState(recipe?.isFavorite ?? false)
  const [isTemplate, setIsTemplate] = useState(recipe?.isTemplate ?? false)
  const [photoUrl, setPhotoUrl]   = useState(recipe?.photoUrl ?? '')
  const [isDragging, setIsDragging] = useState(false)
  const [photoUrlInput, setPhotoUrlInput] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>(recipe?.tags ?? prefill?.suggestedTags ?? [])
  const [openTagGroup, setOpenTagGroup] = useState<string | null>(null)

  // Steps
  const [steps, setSteps] = useState<RecipeStep[]>(
    recipe?.steps.length
      ? recipe.steps
      : prefill?.steps.length
        ? prefill.steps.map((t, i) => ({ id: newId(), order: i + 1, text: t }))
        : [{ id: newId(), order: 1, text: '' }]
  )

  // Ingredient rows
  const [rows, setRows] = useState<DraftIngRow[]>([])
  const [missingNames, setMissingNames] = useState<string[]>([])
  const [showMissingWarning, setShowMissingWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showImportBanner, setShowImportBanner] = useState(fromImport ?? false)

  // Photo input ref
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Keyboard-nav focus tracking
  const [autoFocusRowId, setAutoFocusRowId] = useState<string | null>(null)
  const [autoFocusStepId, setAutoFocusStepId] = useState<string | null>(null)

  // Ingredient link picker modal — shared across all rows, keyed by row id
  const [linkPickerRowId, setLinkPickerRowId] = useState<string | null>(null)
  const linkPickerRow = rows.find(r => r._rowId === linkPickerRowId) ?? null

  function openLinkPicker(rowId: string) {
    setLinkPickerRowId(rowId)
  }

  function handleLinkPick(ing: Ingredient, variant: IngredientVariant) {
    if (linkPickerRowId) updateRow(linkPickerRowId, { ingredientId: ing.id, variantId: variant.id, name: ing.name })
    setLinkPickerRowId(null)
  }

  // Keep the in-editor ingredient database in sync in real time when a new
  // ingredient (or variant) is saved from the mini import panel, so the link
  // picker shows it immediately without a page refresh or recipe save.
  function handleIngredientSaved(saved: Ingredient) {
    setAllIngredients(prev => [...prev.filter(i => i.id !== saved.id), saved])
  }

  useEffect(() => {
    if (!autoFocusRowId) return
    const el = document.querySelector(`input[data-row-qty="${autoFocusRowId}"]`) as HTMLInputElement | null
    if (el) { el.focus(); setAutoFocusRowId(null) }
  }, [autoFocusRowId, rows])

  useEffect(() => {
    if (!autoFocusStepId) return
    const el = document.querySelector(`textarea[data-step-id="${autoFocusStepId}"]`) as HTMLTextAreaElement | null
    if (el) { el.focus(); setAutoFocusStepId(null) }
  }, [autoFocusStepId, steps])

  function addBlankRow() {
    const rowId = newId()
    setRows(prev => [...prev, { _rowId: rowId, name: '', quantity: 1, unit: 'each', servingDisplay: '' }])
    setAutoFocusRowId(rowId)
  }

  function addStepAndFocus() {
    const stepId = newId()
    setSteps(prev => [...prev, { id: stepId, order: prev.length + 1, text: '' }])
    setAutoFocusStepId(stepId)
  }

  function clearAll() {
    if (!confirm('Clear all fields and start over with a blank recipe?')) return
    setName('')
    setServings(4)
    setPrepInput('')
    setCookInput('')
    setPrepMin(0)
    setCookMin(0)
    setNotes('')
    setSourceUrl('')
    setSourceName('')
    setIsFavorite(false)
    setIsTemplate(false)
    setPhotoUrl('')
    setSelectedTags([])
    setSteps([{ id: newId(), order: 1, text: '' }])
    setRows([])
    setShowMissingWarning(false)
    setShowImportBanner(false)
  }

  // Load ingredient database
  useEffect(() => {
    getAllIngredients(false).then(ings => {
      setAllIngredients(ings)
      // Init rows from recipe or prefill
      if (recipe) {
        setRows(recipeToRows(recipe, buildIngredientMap(ings)))
      } else if (prefill) {
        const initRows: DraftIngRow[] = prefill.ingredients.map(ai => {
          const match = ings.find(i => i.name.toLowerCase() === ai.name.toLowerCase())
          return {
            _rowId: newId(),
            ingredientId: match?.id,
            variantId: match?.defaultVariantId || match?.variants[0]?.id,
            name: ai.name,
            quantity: ai.quantity,
            unit: normalizeUnit(ai.unit),
            servingDisplay: ai.servingDisplay ?? '',
          }
        })
        setRows(initRows)
      }
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Computed macros & cost from linked rows
  const linkedIngredients = rowsToIngredients(rows)
  const macrosPerServing  = calcRecipeMacros(linkedIngredients, ingredientMap, servings)
  const costPerServing    = calcRecipeCost(linkedIngredients, ingredientMap, servings)

  // Time parsing on blur
  function handleTimePrepBlur() {
    const m = parseTimeToMinutes(prepInput)
    setPrepMin(m)
    setPrepInput(m > 0 ? formatMinutes(m) : '')
  }
  function handleTimeCookBlur() {
    const m = parseTimeToMinutes(cookInput)
    setCookMin(m)
    setCookInput(m > 0 ? formatMinutes(m) : '')
  }

  // Tag helpers
  function getGroupTags(group: { group: string; tags: string[] }): string[] {
    const tags = [...group.tags]
    // Beverages is useful for both protein-type and extras — add it if not already there
    if ((group.group === 'Protein' || group.group === 'Extras') && !tags.includes('Beverages')) {
      tags.push('Beverages')
    }
    return tags
  }

  function addTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev : [...prev, tag])
    setOpenTagGroup(null)
  }

  function removeTag(tag: string) {
    setSelectedTags(prev => prev.filter(t => t !== tag))
  }

  // Close tag dropdown on outside click
  useEffect(() => {
    if (!openTagGroup) return
    function handleOutside(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-tag-group]')) setOpenTagGroup(null)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openTagGroup])

  // Ingredient rows
  function addPickedIngredient(picked: PickedIngredient) {
    setRows(prev => [...prev, {
      _rowId: newId(),
      ingredientId: picked.ingredient.id,
      variantId: picked.variant.id,
      name: picked.ingredient.name,
      quantity: 1,
      unit: picked.variant.defaultUnit,
      servingDisplay: '',
    }])
  }

  function addMissingIngredient(name: string) {
    setRows(prev => [...prev, {
      _rowId: newId(),
      name,
      quantity: 1,
      unit: 'each',
      servingDisplay: '',
    }])
  }

  function updateRow(rowId: string, patch: Partial<DraftIngRow>) {
    setRows(prev => prev.map(r => r._rowId === rowId ? { ...r, ...patch } : r))
  }

  function removeRow(rowId: string) {
    setRows(prev => prev.filter(r => r._rowId !== rowId))
  }

  function moveRow(rowId: string, dir: -1 | 1) {
    setRows(prev => {
      const idx = prev.findIndex(r => r._rowId === rowId)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  // Steps
  function updateStep(id: string, text: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, text } : s))
  }

  function removeStep(id: string) {
    setSteps(prev => {
      const next = prev.filter(s => s.id !== id)
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  function moveStep(id: string, dir: -1 | 1) {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  // Photo helpers
  function processPhotoFile(file: File) {
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2 MB.'); return }
    const reader = new FileReader()
    reader.onload = ev => setPhotoUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    processPhotoFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)

    // Prefer actual file (local drag or OS drag)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) { processPhotoFile(file); return }

    // Fall back to URL text — browsers pass image URLs as text/uri-list when
    // dragging from a webpage (e.g. Google Images drag-and-drop)
    const urlText = (
      e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain')
    ).trim()
    if (urlText && /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(urlText)) {
      setPhotoUrl(urlText)
    }
  }

  function handlePhotoUrlLoad() {
    const url = photoUrlInput.trim()
    if (!url) return
    try { new URL(url) } catch { alert('Please enter a valid image URL.'); return }
    setPhotoUrl(url)
    setPhotoUrlInput('')
  }

  // Save
  async function handleSave(asTemplate = false) {
    if (!name.trim()) { alert('Recipe name is required.'); return }

    // Check for missing ingredients
    const missing = rows.filter(r => !r.ingredientId).map(r => r.name)
    if (missing.length > 0 && !showMissingWarning) {
      setMissingNames(missing)
      setShowMissingWarning(true)
      return
    }

    setSaving(true)
    const toSave: Recipe = {
      id: recipe?.id || newId(),
      name: name.trim(),
      tags: selectedTags,
      ingredients: rowsToIngredients(rows),
      steps: steps.filter(s => s.text.trim()),
      servings,
      prepTimeMinutes: prepMin,
      cookTimeMinutes: cookMin,
      notes: notes.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceName: sourceName.trim() || undefined,
      isFavorite,
      isTemplate: asTemplate || isTemplate,
      photoUrl: photoUrl || undefined,
      macrosPerServing,
      estimatedCostPerServing: costPerServing,
      createdAt: recipe?.createdAt || now(),
      updatedAt: now(),
    }
    await onSave(toSave)
    setSaving(false)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Clipboard image paste (Ctrl+V anywhere in the editor)
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) processPhotoFile(file)
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const units = availableUnits(settings.unitSystem).map(u => ({ value: u, label: u }))

  return createPortal(
    <div className={`${styles.overlay} ${referenceText ? styles.overlaySplit : ''}`} role="dialog" aria-modal="true" aria-label={isNew ? 'New Recipe' : `Edit ${recipe?.name}`}>
      {referenceText && (
        <div className={styles.referencePanel}>
          <div className={styles.referencePanelHeader}>
            <span className={styles.referencePanelTitle}>Recipe Reference</span>
            <span className={styles.referencePanelHint}>Read here, fill in the fields →</span>
          </div>
          <pre className={styles.referenceText}>{referenceText}</pre>
        </div>
      )}
      <div className={`${styles.editor} ${referenceText ? styles.editorFlexFill : ''}`}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.nameField}>
              <label className={styles.nameLabel} htmlFor="recipe-name">Recipe Name</label>
              <input
                id="recipe-name"
                className={uncertainFields.has('name') ? `${styles.nameInput} ${styles.fieldWarning}` : styles.nameInput}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Creamy Garlic Pasta"
                autoFocus={isNew}
              />
            </div>
            <div className={styles.headerToggles}>
              <button
                className={`${styles.favToggle} ${isFavorite ? styles.favActive : ''}`}
                onClick={() => setIsFavorite(v => !v)}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorite ? '♥' : '♡'} Favorite
              </button>
              <Toggle label="Template" checked={isTemplate} onChange={setIsTemplate} />
              <button className={styles.clearBtn} onClick={clearAll} type="button">
                Clear all
              </button>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </header>

        {/* ── Import review notice ── */}
        {showImportBanner && (
          <div className={
            importNotice?.level === 'success' ? `${styles.importBanner} ${styles.importBannerSuccess}`
              : importNotice?.level === 'warning' ? `${styles.importBanner} ${styles.importBannerWarning}`
              : styles.importBanner
          }>
            <div>
              <span>{importNotice?.message ?? 'Import complete — please review and correct everything before saving.'}</span>
              {importNotice?.subMessage && <div className={styles.importBannerSub}>{importNotice.subMessage}</div>}
            </div>
            <button className={styles.importBannerClose} onClick={() => setShowImportBanner(false)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* ── Missing ingredient warning ── */}
        {showMissingWarning && (
          <div className={styles.missingBanner}>
            <strong>Unlinked ingredients:</strong> {missingNames.join(', ')} — not in your ingredient database, so their macros and cost won't be counted.
            {' '}Use the <strong>Link</strong> button on each unlinked row to find or add them, or save anyway to skip macro tracking for those items.
            <div className={styles.missingActions}>
              <button className={styles.missingBtn} onClick={() => { setShowMissingWarning(false); handleSave() }}>
                Save anyway
              </button>
              <button className={styles.missingBtnCancel} onClick={() => setShowMissingWarning(false)}>
                Go back and fix
              </button>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className={styles.body}>
          {/* ─ Details ─ */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Details</h3>
            <div className={styles.detailsGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Total Servings</label>
                <input
                  type="number"
                  min={1}
                  value={servings}
                  onChange={e => setServings(Math.max(1, +e.target.value))}
                  className={uncertainFields.has('servings') ? `${styles.numInput} ${styles.fieldWarning}` : styles.numInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Prep Time</label>
                <input
                  type="text"
                  value={prepInput}
                  onChange={e => setPrepInput(e.target.value)}
                  onBlur={handleTimePrepBlur}
                  placeholder="e.g. 20 min"
                  className={uncertainFields.has('prep') ? `${styles.textInput} ${styles.fieldWarning}` : styles.textInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Cook Time</label>
                <input
                  type="text"
                  value={cookInput}
                  onChange={e => setCookInput(e.target.value)}
                  onBlur={handleTimeCookBlur}
                  placeholder="e.g. 1 hr 30 min"
                  className={uncertainFields.has('cook') ? `${styles.textInput} ${styles.fieldWarning}` : styles.textInput}
                />
              </div>
            </div>

            {/* Tags */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Tags</label>
              <div className={styles.tagGroups}>
                {settings.recipeTags.map(group => {
                  const allGroupTags = getGroupTags(group)
                  const available     = allGroupTags.filter(t => !selectedTags.includes(t))
                  const groupSelected = allGroupTags.filter(t => selectedTags.includes(t))
                  const isOpen        = openTagGroup === group.group
                  return (
                    <div key={group.group} className={styles.tagGroupRow} data-tag-group={group.group}>
                      <div className={styles.tagDropdownWrap}>
                        <button
                          type="button"
                          className={`${styles.tagDropdownBtn} ${isOpen ? styles.tagDropdownBtnOpen : ''}`}
                          onClick={() => setOpenTagGroup(isOpen ? null : group.group)}
                          disabled={available.length === 0}
                        >
                          + Add {group.group}
                          <span className={styles.tagDropdownArrow} aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
                        </button>
                        {isOpen && (
                          <ul className={styles.tagDropdownMenu} role="listbox">
                            {available.map(tag => (
                              <li key={tag} role="option">
                                <button
                                  type="button"
                                  className={styles.tagDropdownOption}
                                  onMouseDown={e => { e.preventDefault(); addTag(tag) }}
                                >
                                  {tag}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {groupSelected.length > 0 && (
                        <div className={styles.tagChipRow}>
                          {groupSelected.map(tag => (
                            <span key={tag} className={styles.tagSelectedChip}>
                              {tag}
                              <button
                                type="button"
                                className={styles.tagChipRemove}
                                onClick={() => removeTag(tag)}
                                aria-label={`Remove ${tag}`}
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {selectedTags.includes('Beverages') && (
                <p className={styles.tagHint}>
                  💧 For homemade drinks like sweet tea or smoothies, add your ingredients (water, sugar, tea bags, etc.)
                  and the macros will calculate automatically. Recipe scaling works perfectly — making a gallon vs. a quart
                  adjusts all ingredient quantities.
                </p>
              )}
            </div>

            {/* Source */}
            <div className={styles.row2}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Source URL</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={e => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Source Name</label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={e => setSourceName(e.target.value)}
                  placeholder="e.g. AllRecipes"
                  className={styles.textInput}
                />
              </div>
            </div>

            {/* Photo */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Photo (optional, max 2 MB)</label>
              <div
                className={`${styles.photoDropZone} ${isDragging ? styles.photoDropZoneActive : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                {photoUrl ? (
                  <div className={styles.photoPreview}>
                    <img src={photoUrl} alt="Recipe" className={styles.photoImg} />
                    <button className={styles.photoRemove} onClick={() => setPhotoUrl('')}>Remove photo</button>
                  </div>
                ) : (
                  <>
                    <div className={styles.photoPlaceholder}>
                      <button className={styles.photoUpload} onClick={() => photoInputRef.current?.click()}>
                        📷 Browse file
                      </button>
                      <span className={styles.photoDivider}>or drag & drop / paste (Ctrl+V)</span>
                    </div>
                    <div className={styles.photoUrlRow}>
                      <input
                        type="url"
                        className={styles.photoUrlInput}
                        value={photoUrlInput}
                        onChange={e => setPhotoUrlInput(e.target.value)}
                        placeholder="Or paste an image URL…"
                        onKeyDown={e => { if (e.key === 'Enter') handlePhotoUrlLoad() }}
                      />
                      <button
                        className={styles.photoUrlBtn}
                        onClick={handlePhotoUrlLoad}
                        disabled={!photoUrlInput.trim()}
                      >
                        Load
                      </button>
                    </div>
                  </>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenInput}
                  onChange={handlePhotoSelect}
                />
              </div>
            </div>
          </section>

          {/* ─ Ingredients ─ */}
          <section className={styles.section}>
            <h3 className={uncertainFields.has('ingredients') ? `${styles.sectionTitle} ${styles.sectionTitleWarning}` : styles.sectionTitle}>
              Ingredients
            </h3>
            {uncertainFields.has('ingredients') && (
              <p className={styles.fieldWarningHint}>No ingredients could be read from the photo — add them below.</p>
            )}
            {importNotice?.level === 'warning' && !uncertainFields.has('ingredients') && (
              <p className={styles.fieldWarningHint}>
                Always verify ingredient quantities carefully — measurement errors in recipes can significantly affect results.
              </p>
            )}

            {rows.length > 0 && (
              <div className={styles.ingTable}>
                <div className={styles.ingHeader}>
                  <span className={styles.ingColName}>Ingredient</span>
                  <span className={styles.ingColQty}>Qty</span>
                  <span className={styles.ingColUnit}>Unit</span>
                  <span className={styles.ingColDisplay}>Serving display</span>
                  <span />
                </div>
                {rows.map((row, idx) => (
                  <IngredientRow
                    key={row._rowId}
                    row={row}
                    isFirst={idx === 0}
                    isLast={idx === rows.length - 1}
                    units={units}
                    ingredient={ingredientMap.get(row.ingredientId ?? '')}
                    onUpdate={patch => updateRow(row._rowId, patch)}
                    onRemove={() => removeRow(row._rowId)}
                    onMoveUp={() => moveRow(row._rowId, -1)}
                    onMoveDown={() => moveRow(row._rowId, 1)}
                    onAddAfter={addBlankRow}
                    allIngredients={allIngredients}
                    onOpenLinkPicker={() => openLinkPicker(row._rowId)}
                  />
                ))}
              </div>
            )}

            <div className={styles.ingPickerRow}>
              <IngredientPicker
                onPick={addPickedIngredient}
                onCreateNew={addMissingIngredient}
                placeholder="Search ingredient to add…"
              />
            </div>
          </section>

          {/* ─ Instructions ─ */}
          <section className={styles.section}>
            <h3 className={uncertainFields.has('steps') ? `${styles.sectionTitle} ${styles.sectionTitleWarning}` : styles.sectionTitle}>
              Instructions
            </h3>
            {uncertainFields.has('steps') && (
              <p className={styles.fieldWarningHint}>No steps could be read from the photo — add them below.</p>
            )}
            <div className={styles.stepsList}>
              {steps.map((step, idx) => (
                <div key={step.id} className={styles.stepRow}>
                  <span className={styles.stepNum}>{idx + 1}</span>
                  <StepTextarea
                    stepId={step.id}
                    value={step.text}
                    placeholder={`Step ${idx + 1}… (Enter to add next step, Shift+Enter for new line)`}
                    onChange={text => updateStep(step.id, text)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        addStepAndFocus()
                      }
                    }}
                  />
                  <div className={styles.stepBtns}>
                    <button
                      className={styles.stepMover}
                      onClick={() => moveStep(step.id, -1)}
                      disabled={idx === 0}
                      title="Move up"
                    >▲</button>
                    <button
                      className={styles.stepMover}
                      onClick={() => moveStep(step.id, 1)}
                      disabled={idx === steps.length - 1}
                      title="Move down"
                    >▼</button>
                    <button
                      className={styles.stepRemove}
                      onClick={() => removeStep(step.id)}
                      disabled={steps.length === 1}
                      title="Remove step"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
            <button className={styles.addStepBtn} onClick={addStepAndFocus}>+ Add Step</button>
          </section>

          {/* ─ Notes ─ */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notes <span className={styles.optional}>(optional)</span></h3>
            <textarea
              className={styles.notesArea}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Personal notes, tips, variations…"
              rows={3}
            />
          </section>
        </div>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          {/* Macro / cost summary */}
          <div className={styles.summary}>
            {macrosPerServing.calories > 0 && (
              <span className={styles.summaryItem}>
                <strong>{Math.round(macrosPerServing.calories)}</strong> cal
              </span>
            )}
            {macrosPerServing.protein > 0 && (
              <span className={styles.summaryItem}><strong>{formatMacro(macrosPerServing.protein)}</strong>g P</span>
            )}
            {macrosPerServing.carbs > 0 && (
              <span className={styles.summaryItem}><strong>{formatMacro(macrosPerServing.carbs)}</strong>g C</span>
            )}
            {macrosPerServing.fat > 0 && (
              <span className={styles.summaryItem}><strong>{formatMacro(macrosPerServing.fat)}</strong>g F</span>
            )}
            {costPerServing != null && (
              <span className={styles.summaryItem}><strong>${costPerServing.toFixed(2)}</strong>/sv</span>
            )}
            {macrosPerServing.calories > 0 && (
              <span className={styles.summaryMeta}>per serving · {servings} servings total</span>
            )}
          </div>

          <div className={styles.footerBtns}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
              Save as Template
            </Button>
            <Button onClick={() => handleSave(false)} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Add Recipe' : 'Save Changes'}
            </Button>
          </div>
        </footer>
      </div>

      <IngredientLinkModal
        open={linkPickerRowId !== null}
        initialQuery={linkPickerRow?.name ?? ''}
        allIngredients={allIngredients}
        onClose={() => setLinkPickerRowId(null)}
        onPick={handleLinkPick}
        onIngredientSaved={handleIngredientSaved}
      />
    </div>,
    document.body
  )
}

// ─── Ingredient row inside the editor ────────────────────────────────────────

function IngredientNameInput({ value, rowId, allIngredients, onChange, onLink }: {
  value: string
  rowId: string
  allIngredients: Ingredient[]
  onChange: (name: string) => void
  onLink: (ing: Ingredient, variantId: string) => void
}) {
  const [open, setOpen] = useState(false)
  // null = nothing highlighted, i.e. Enter confirms the typed text as-is.
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  const suggestions = useMemo(() => {
    const q = value.trim()
    if (q.length < 1) return []
    return allIngredients
      .filter(i => !i.archived)
      .map(i => ({ ing: i, score: scoreIngredientMatch(i.name, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.ing)
  }, [value, allIngredients])

  // A fresh suggestion list shouldn't keep a stale highlight from before —
  // that could silently link the wrong ingredient on the next Enter press.
  useEffect(() => {
    setHighlightedIndex(null)
  }, [suggestions])

  function confirmAsTyped() {
    setOpen(false)
    setHighlightedIndex(null)
  }

  function selectSuggestion(ing: Ingredient) {
    onLink(ing, ing.defaultVariantId || ing.variants[0]?.id || '')
    setOpen(false)
    setHighlightedIndex(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Dismiss the dropdown but leave whatever the user typed untouched.
      // Stop propagation so this doesn't bubble up to the editor's own
      // document-level Escape handler, which would close the whole editor.
      e.stopPropagation()
      confirmAsTyped()
      return
    }
    if (e.key === 'ArrowDown' && open && suggestions.length > 0) {
      e.preventDefault()
      setHighlightedIndex(i => i === null ? 0 : Math.min(i + 1, suggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp' && open && suggestions.length > 0) {
      e.preventDefault()
      setHighlightedIndex(i => i === null ? suggestions.length - 1 : Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Only a deliberately highlighted suggestion gets picked — otherwise
      // Enter simply confirms the free-typed name, unlinked.
      if (open && highlightedIndex !== null && suggestions[highlightedIndex]) {
        selectSuggestion(suggestions[highlightedIndex])
      } else {
        confirmAsTyped()
      }
      return
    }
    if (e.key === 'Tab') {
      // Tab should never pick a suggestion — just close the dropdown and,
      // moving forward, hand focus straight to the quantity field so an
      // about-to-vanish suggestion button doesn't steal it instead.
      setOpen(false)
      setHighlightedIndex(null)
      if (!e.shiftKey) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>(`input[data-row-qty="${rowId}"]`)?.focus()
      }
    }
  }

  return (
    <div className={styles.nameSuggestWrap}>
      <input
        type="text"
        className={styles.nameUnlinkedInput}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder="Ingredient name…"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
        <ul className={styles.suggestions} role="listbox">
          {suggestions.map((ing, i) => {
            const dv = ing.variants.find(v => v.id === ing.defaultVariantId) ?? ing.variants[0]
            const brand = dv?.brand ?? ''
            const calories = dv ? Math.round(dv.macros.calories) : 0
            return (
              <li key={ing.id} role="option" aria-selected={highlightedIndex === i}>
                <button
                  type="button"
                  className={`${styles.suggestionItem} ${highlightedIndex === i ? styles.suggestionItemHighlighted : ''}`}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={e => {
                    e.preventDefault()
                    selectSuggestion(ing)
                  }}
                >
                  <span className={styles.suggestionName}>{ing.name}</span>
                  {(brand || calories > 0) && (
                    <span className={styles.suggestionMeta}>
                      {brand}{brand && calories > 0 ? ' · ' : ''}{calories > 0 ? `${calories} cal` : ''}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          <li className={styles.suggestionDivider} role="separator" aria-hidden="true" />
          <li>
            <button
              type="button"
              className={styles.useAsTypedItem}
              onMouseDown={e => {
                e.preventDefault()
                confirmAsTyped()
              }}
            >
              Use "{value.trim()}" as typed
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

const QUICK_UNITS: IngredientUnit[] = ['cup', 'tbsp', 'tsp', 'oz', 'lb']

function IngredientRow({
  row, isFirst, isLast, units, ingredient, onUpdate, onRemove, onMoveUp, onMoveDown, onAddAfter, allIngredients, onOpenLinkPicker,
}: {
  row: DraftIngRow
  isFirst: boolean
  isLast: boolean
  units: { value: string; label: string }[]
  ingredient?: Ingredient
  onUpdate: (patch: Partial<DraftIngRow>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddAfter: () => void
  allIngredients: Ingredient[]
  onOpenLinkPicker: () => void
}) {
  const isMissing = !row.ingredientId
  const variant = ingredient?.variants.find(v => v.id === row.variantId) ?? ingredient?.variants[0]

  return (
    <div className={`${styles.ingRowWrap} ${isMissing ? styles.ingRowMissing : ''}`}>
      <div className={styles.ingRow}>
        {/* Name / suggest input for unlinked, static display for linked */}
        <div className={styles.ingName}>
          <div className={styles.ingNameMain}>
            <div className={styles.ingNameContent}>
              {isMissing
                ? (
                    <IngredientNameInput
                      value={row.name}
                      rowId={row._rowId}
                      allIngredients={allIngredients}
                      onChange={name => onUpdate({ name })}
                      onLink={(ing, variantId) => onUpdate({ ingredientId: ing.id, variantId, name: ing.name })}
                    />
                  )
                : <span className={styles.ingNameText}>{row.name}</span>
              }
            </div>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={onOpenLinkPicker}
              title={isMissing ? 'Link to a database ingredient' : 'Change linked ingredient'}
              aria-label="Link ingredient"
            >
              <Link size={13} />
            </button>
          </div>

          {isMissing
            ? (
                <span className={styles.linkStatusOff}>
                  <Link2Off size={12} className={styles.linkStatusIcon} />
                  Not linked
                </span>
              )
            : (
                <span className={styles.linkStatusOn}>
                  <Link2 size={12} className={styles.linkStatusIcon} />
                  Linked to: <strong>{ingredient?.name}</strong>
                  {ingredient && ingredient.variants.length > 0 && (
                    <>
                      {' → '}
                      <select
                        className={styles.variantSelect}
                        value={row.variantId ?? ''}
                        onChange={e => onUpdate({ variantId: e.target.value })}
                      >
                        {ingredient.variants.map(v => (
                          <option key={v.id} value={v.id}>{v.brand}</option>
                        ))}
                      </select>
                    </>
                  )}
                </span>
              )
          }

          {variant && (
            <span className={styles.ingMacroHint}>
              {Math.round(variant.macros.calories)} cal · {variant.macros.protein}g P per serving
            </span>
          )}
        </div>

        {/* Quantity — Enter adds new row */}
        <input
          type="number"
          min={0}
          step="any"
          value={row.quantity}
          onChange={e => onUpdate({ quantity: +e.target.value || 0 })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddAfter() } }}
          data-row-qty={row._rowId}
          className={styles.qtyInput}
        />

        {/* Unit dropdown */}
        <select
          value={row.unit}
          onChange={e => onUpdate({ unit: e.target.value as IngredientUnit })}
          className={styles.unitSelect}
        >
          {units.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>

        {/* Serving display — Tab adds new row */}
        <input
          type="text"
          value={row.servingDisplay}
          onChange={e => onUpdate({ servingDisplay: e.target.value })}
          onKeyDown={e => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); onAddAfter() } }}
          placeholder="e.g. 6 oz"
          className={styles.displayInput}
        />

        {/* Move / remove */}
        <div className={styles.rowBtns}>
          <button className={styles.rowMover} onClick={onMoveUp}  disabled={isFirst}>▲</button>
          <button className={styles.rowMover} onClick={onMoveDown} disabled={isLast}>▼</button>
          <button className={styles.rowRemove} onClick={onRemove}>×</button>
        </div>
      </div>

      {/* Quick unit pills */}
      <div className={styles.quickUnits}>
        {QUICK_UNITS.map(u => (
          <button
            key={u}
            type="button"
            className={`${styles.quickUnit} ${row.unit === u ? styles.quickUnitActive : ''}`}
            onClick={() => onUpdate({ unit: u })}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  )
}
