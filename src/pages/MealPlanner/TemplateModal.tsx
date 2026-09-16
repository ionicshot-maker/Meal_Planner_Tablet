import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDiscardDialog, Modal, Button } from '@/components/ui'
import { useConfirmClose } from '@/hooks/useConfirmClose'
import type { MealPlanDay, MealPlanWeekTemplate } from '@/types'
import { toISODate, addDays, getWeekStart, parseDateLocal, formatMonthRange } from '@/utils/mealPlanUtils'
import styles from './TemplateModal.module.css'

interface Props {
  templates: MealPlanWeekTemplate[]
  currentWeekDays: MealPlanDay[]
  weekStart: Date
  onSave: (name: string) => void
  onApply: (template: MealPlanWeekTemplate) => void
  onDelete: (id: string) => void
  onCopyWeek: (targetWeekStart: string) => void
  onClose: () => void
}

export function TemplateModal({
  templates,
  currentWeekDays,
  weekStart,
  onSave,
  onApply,
  onDelete,
  onCopyWeek,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'templates' | 'copy'>('templates')
  const [newName, setNewName] = useState('')
  const [copyTarget, setCopyTarget] = useState(toISODate(addDays(weekStart, 7)))
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmingCopy, setConfirmingCopy] = useState(false)

  // Only the "save as template" name field on the Templates tab is unsaved
  // typed input — Copy Week is date/click selections only, low-stakes to lose.
  const isDirty = tab === 'templates' && newName.trim() !== ''
  const { confirming, requestClose, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  const currentHasContent = currentWeekDays.some(d =>
    d.meals.breakfast.length + d.meals.lunch.length + d.meals.dinner.length + d.meals.snacks.length > 0
  )

  // Derived entirely from copyTarget (already-selected date) via the same
  // getWeekStart()/addDays() utilities handleCopy() itself already uses —
  // no fetch of the target week's actual contents, just the date range it
  // covers, so the confirmation below can state the range without touching
  // handleCopyWeek()'s write path at all.
  const targetWeekStart = getWeekStart(parseDateLocal(copyTarget))
  const targetWeekEnd = addDays(targetWeekStart, 6)
  const targetRangeLabel = formatMonthRange(toISODate(targetWeekStart), toISODate(targetWeekEnd))

  function handleSave() {
    const name = newName.trim()
    if (!name) return
    onSave(name)
    setNewName('')
  }

  function handleCopy() {
    const target = parseDateLocal(copyTarget)
    const weekStartOfTarget = getWeekStart(target)
    onCopyWeek(toISODate(weekStartOfTarget))
    onClose()
  }

  return createPortal(
    <>
    <div className={styles.overlay} onClick={requestClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === 'templates' ? styles.tabActive : ''}`}
              onClick={() => setTab('templates')}
            >Templates</button>
            <button
              className={`${styles.tab} ${tab === 'copy' ? styles.tabActive : ''}`}
              onClick={() => setTab('copy')}
            >Copy Week</button>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {tab === 'templates' && (
            <>
              {/* Save current week as template */}
              {currentHasContent && (
                <div className={styles.saveSection}>
                  <span className={styles.sectionTitle}>Save this week as a template</span>
                  <div className={styles.saveRow}>
                    <input
                      type="text"
                      className={styles.nameInput}
                      placeholder="Template name…"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                    />
                    <button
                      className={styles.saveBtn}
                      onClick={handleSave}
                      disabled={!newName.trim()}
                    >Save</button>
                  </div>
                </div>
              )}

              {/* Template list */}
              {templates.length === 0 ? (
                <div className={styles.empty}>No saved templates yet.</div>
              ) : (
                <ul className={styles.list}>
                  {templates.map(t => (
                    <li key={t.id} className={styles.templateRow}>
                      <span className={styles.templateName}>{t.name}</span>
                      <div className={styles.templateActions}>
                        <button
                          className={styles.applyBtn}
                          onClick={() => { onApply(t); onClose() }}
                        >Apply</button>
                        {confirmDelete === t.id ? (
                          <>
                            <button
                              className={styles.deleteConfirmBtn}
                              onClick={() => { onDelete(t.id); setConfirmDelete(null) }}
                            >Delete</button>
                            <button
                              className={styles.cancelBtn}
                              onClick={() => setConfirmDelete(null)}
                            >Cancel</button>
                          </>
                        ) : (
                          <button
                            className={styles.deleteBtn}
                            onClick={() => setConfirmDelete(t.id)}
                          >✕</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'copy' && (
            <div className={styles.copySection}>
              <p className={styles.copyDesc}>
                Copy this week's meal plan to another week. Existing meals on the target week will be replaced.
              </p>
              <label className={styles.copyLabel}>
                Copy to week containing:
                <input
                  type="date"
                  className={styles.dateInput}
                  value={copyTarget}
                  onChange={e => setCopyTarget(e.target.value)}
                />
              </label>
              <button
                className={styles.copyBtn}
                onClick={() => setConfirmingCopy(true)}
                disabled={!currentHasContent}
              >Copy Week</button>
              {!currentHasContent && (
                <p className={styles.copyNote}>Nothing to copy — this week has no planned meals.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    <ConfirmDiscardDialog open={confirming} onKeepEditing={cancelDiscard} onDiscard={confirmDiscard} />
    {confirmingCopy && (
      <Modal
        open
        onClose={() => setConfirmingCopy(false)}
        title="Copy Week"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingCopy(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleCopy}>Replace &amp; Copy</Button>
          </>
        }
      >
        <p>
          Existing meals for <strong>{targetRangeLabel}</strong> will be permanently replaced with this week's plan.
          This cannot be undone.
        </p>
      </Modal>
    )}
    </>,
    document.body
  )
}
