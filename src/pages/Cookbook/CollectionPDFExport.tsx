import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { formatMinutes } from '@/utils/units'
import { formatMacro } from '@/utils/recipeCalculations'
import type { Recipe, RecipeCollection, KitchenReference } from '@/types'
import { CONTENT_TYPES } from './referenceContentTypes'
import styles from './CollectionPDFExport.module.css'

interface Props {
  collection: RecipeCollection
  recipes: Recipe[]
  references: KitchenReference[]
  onClose: () => void
}

interface ExportOptions {
  title: string
  includeTOC: boolean
  includePhotos: boolean
  includeNutrition: boolean
  includeCost: boolean
  includeReferences: boolean
}

export function CollectionPDFExport({ collection, recipes, references, onClose }: Props) {
  const { settings } = useSettings()
  const [options, setOptions] = useState<ExportOptions>({
    title: collection.name,
    includeTOC: true,
    includePhotos: true,
    includeNutrition: true,
    includeCost: false,
    includeReferences: true,
  })

  // "Reference pages tagged to the same source" — derive the collection's
  // source(s) from whichever Source-group tags its recipes carry, then match
  // any reference entries that share at least one of those same tags.
  const sourceGroupTags = new Set(settings.recipeTags.find(g => g.group === 'Source')?.tags ?? [])
  const collectionSourceTags = new Set(recipes.flatMap(r => r.tags).filter(t => sourceGroupTags.has(t)))
  const matchingReferences = references.filter(ref => ref.sourceTags.some(t => collectionSourceTags.has(t)))

  function toggle(key: keyof Omit<ExportOptions, 'title'>) {
    setOptions(o => ({ ...o, [key]: !o[key] }))
  }

  function buildHTML(): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const tocRows = options.includeTOC
      ? recipes.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td>${options.includeNutrition && r.macrosPerServing ? `<td>${Math.round(r.macrosPerServing.calories)} cal</td>` : ''}</tr>`).join('')
      : ''

    const recipePages = recipes.map((r, idx) => {
      const m = r.macrosPerServing
      const totalTime = r.prepTimeMinutes + r.cookTimeMinutes
      const macroLine = options.includeNutrition && m && m.calories > 0
        ? `<div class="macros">Per serving: <strong>${Math.round(m.calories)}</strong> cal &middot; <strong>${formatMacro(m.protein)}</strong>g protein &middot; <strong>${formatMacro(m.carbs)}</strong>g carbs &middot; <strong>${formatMacro(m.fat)}</strong>g fat</div>`
        : ''
      const costLine = options.includeCost && r.estimatedCostPerServing != null
        ? `<div class="cost">Est. cost: <strong>$${r.estimatedCostPerServing.toFixed(2)}</strong> per serving</div>`
        : ''
      const photoHtml = options.includePhotos && r.photoUrl
        ? `<img class="photo" src="${r.photoUrl}" alt="${esc(r.name)}" />`
        : ''
      const ings = r.ingredients.map(ri => `<li>${esc(ri.servingDisplay ?? `${ri.quantity} ${ri.unit}`)} ${esc(ri.name)}</li>`).join('')
      const steps = r.steps.slice().sort((a, b) => a.order - b.order).map(s => `<li>${esc(s.text)}</li>`).join('')
      const tags = r.tags.length > 0
        ? `<div class="tags">${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
        : ''

      return `<div class="recipe-page${idx > 0 ? ' page-break' : ''}">
${photoHtml}
<h2>${esc(r.name)}</h2>
${tags}
<div class="meta">${r.servings} serving${r.servings !== 1 ? 's' : ''}${totalTime > 0 ? ` &nbsp;&middot;&nbsp; ${formatMinutes(totalTime)}` : ''}${r.sourceName ? ` &nbsp;&middot;&nbsp; ${esc(r.sourceName)}` : ''}</div>
${macroLine}${costLine}
${r.ingredients.length > 0 ? `<h3>Ingredients</h3><ul class="ings">${ings}</ul>` : ''}
${r.steps.length > 0 ? `<h3>Instructions</h3><ol class="steps">${steps}</ol>` : ''}
${r.notes ? `<div class="notes"><em>${esc(r.notes)}</em></div>` : ''}
</div>`
    }).join('\n')

    const referencePages = options.includeReferences ? matchingReferences.map(ref => {
      const typeInfo = CONTENT_TYPES.find(c => c.value === ref.contentType)
      const refTags = ref.sourceTags.length > 0
        ? `<div class="tags">${ref.sourceTags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
        : ''
      const refPhoto = options.includePhotos && ref.photoUrl
        ? `<img class="photo" src="${ref.photoUrl}" alt="${esc(ref.title)}" />`
        : ''
      const body = ref.tableData && ref.tableData.length > 0
        ? `<table>${ref.tableData.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</table>`
        : `<div class="ref-content">${esc(ref.content).replace(/\n/g, '<br>')}</div>`

      return `<div class="recipe-page page-break">
${refPhoto}
<h2>${esc(ref.title)}</h2>
<div class="meta">${typeInfo ? esc(typeInfo.label) : 'Reference'}</div>
${refTags}
${body}
</div>`
    }).join('\n') : ''

    const referencesTocRow = referencePages
      ? `<tr><td colspan="${options.includeNutrition ? 3 : 2}"><em>+ ${matchingReferences.length} kitchen reference page${matchingReferences.length !== 1 ? 's' : ''} at the back</em></td></tr>`
      : ''

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(options.title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;font-size:11pt;color:#111;padding:28px;max-width:720px;margin:0 auto}
h1{font-size:22pt;font-weight:bold;margin-bottom:4px;text-align:center}
h2{font-size:15pt;font-weight:bold;margin:14px 0 6px}
h3{font-size:11pt;font-weight:bold;margin:12px 0 6px;border-bottom:1px solid #ddd;padding-bottom:2px}
.subtitle{text-align:center;color:#666;font-size:10pt;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{text-align:left;border-bottom:2px solid #333;padding:4px 8px;font-size:10pt}
td{padding:4px 8px;font-size:10pt;border-bottom:1px solid #eee}
.recipe-page{margin-bottom:0}
.page-break{page-break-before:always;padding-top:12px}
.photo{width:100%;max-height:220px;object-fit:cover;border-radius:4px;margin-bottom:10px}
.tags{margin:4px 0 8px}
.tag{display:inline-block;font-size:8pt;background:#e8ddc8;padding:2px 8px;border-radius:10px;margin-right:4px}
.meta{font-size:9pt;color:#666;margin-bottom:8px}
.macros{font-size:9.5pt;color:#444;background:#faf4e8;padding:6px 10px;border-radius:4px;margin-bottom:6px}
.cost{font-size:9.5pt;color:#444;margin-bottom:8px}
ul.ings{list-style:none;columns:2;column-gap:20px;margin-bottom:12px}
ul.ings li{padding:2px 0;font-size:10pt}
ol.steps{margin-left:18px;margin-bottom:12px}
ol.steps li{margin-bottom:6px;font-size:10pt;line-height:1.5}
.notes{font-style:italic;color:#555;font-size:10pt;border-left:3px solid #ddd;padding-left:10px;margin-top:8px}
.ref-content{font-size:10pt;line-height:1.6;white-space:pre-line}
@media print{body{padding:12px}}
</style></head><body>
<h1>${esc(options.title)}</h1>
<p class="subtitle">${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}</p>
${options.includeTOC && recipes.length > 1 ? `<h3>Table of Contents</h3><table><thead><tr><th>#</th><th>Recipe</th>${options.includeNutrition ? '<th>Calories</th>' : ''}</tr></thead><tbody>${tocRows}${referencesTocRow}</tbody></table>` : ''}
${recipePages}
${referencePages}
</body></html>`
  }

  function handleExport() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(buildHTML())
    w.document.close()
    setTimeout(() => w.print(), 400)
    onClose()
  }

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <h3 className={styles.dialogTitle}>Export Collection as PDF</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>Title</label>
            <input
              className={styles.input}
              value={options.title}
              onChange={e => setOptions(o => ({ ...o, title: e.target.value }))}
              placeholder="Collection title…"
            />
          </div>

          <div className={styles.checkboxGroup}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={options.includeTOC} onChange={() => toggle('includeTOC')} />
              Include table of contents
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={options.includePhotos} onChange={() => toggle('includePhotos')} />
              Include recipe photos
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={options.includeNutrition} onChange={() => toggle('includeNutrition')} />
              Include nutrition info
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={options.includeCost} onChange={() => toggle('includeCost')} />
              Include estimated cost
            </label>
            {matchingReferences.length > 0 && (
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={options.includeReferences} onChange={() => toggle('includeReferences')} />
                Include {matchingReferences.length} reference page{matchingReferences.length !== 1 ? 's' : ''} from the same source
              </label>
            )}
          </div>

          <p className={styles.hint}>
            Exports {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} from "{collection.name}"
            {options.includeReferences && matchingReferences.length > 0
              ? `, plus ${matchingReferences.length} reference page${matchingReferences.length !== 1 ? 's' : ''} at the back`
              : ''}.
          </p>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleExport}>Export &amp; Print</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
