import { useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { Button, Card, Input, Select, Toggle, Modal } from '@/components/ui'
import { newId } from '@/utils/ids'
import type { Person, PersonMode, PayFrequency, Sex, ActivityLevel, PaydaySchedule } from '@/types'
import styles from './HouseholdSection.module.css'

const FREQ_OPTIONS: { value: PayFrequency; label: string }[] = [
  { value: 'weekly',       label: 'Weekly' },
  { value: 'biweekly',     label: 'Bi-weekly' },
  { value: 'semi-monthly', label: 'Semi-monthly (1st & 15th)' },
  { value: 'monthly',      label: 'Monthly' },
]

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other' },
]

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary',   label: 'Sedentary (little/no exercise)' },
  { value: 'light',       label: 'Light (1–3 days/week)' },
  { value: 'moderate',    label: 'Moderate (3–5 days/week)' },
  { value: 'active',      label: 'Active (6–7 days/week)' },
  { value: 'very-active', label: 'Very active (hard exercise daily)' },
]

const PAYDAY_COLORS = ['#E74C3C', '#E67E22', '#27AE60', '#2980B9', '#8E44AD', '#16A085']

export function HouseholdSection() {
  const { settings, updateSettings } = useSettings()
  const { householdSize, people } = settings
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [isAddingPerson, setIsAddingPerson] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  function addPerson() {
    const newPerson: Person = {
      id: newId(),
      name: `Person ${people.length + 1}`,
      mode: 'simple',
    }
    setIsAddingPerson(true)
    setEditingPerson(newPerson)
  }

  function savePerson(updated: Person) {
    if (isAddingPerson) {
      const next = [...people, updated]
      updateSettings({ people: next, householdSize: next.length })
    } else {
      updateSettings({ people: people.map(p => p.id === updated.id ? updated : p) })
    }
    setEditingPerson(null)
    setIsAddingPerson(false)
  }

  function deletePerson(id: string) {
    const next = people.filter(p => p.id !== id)
    updateSettings({ people: next, householdSize: Math.max(1, next.length) })
    setShowDeleteConfirm(null)
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Household</h2>

      <Card>
        <div className={styles.nameRow}>
          <label className={styles.fieldLabel} htmlFor="householdName">Household Name</label>
          <div className={styles.fieldHint}>Used as a title prefix throughout the app (e.g. "Smith Family")</div>
          <Input
            id="householdName"
            value={settings.householdName}
            onChange={e => updateSettings({ householdName: e.target.value })}
            placeholder="e.g. Angelo Family"
          />
        </div>
      </Card>

      <Card>
        <div className={styles.sizeRow}>
          <span className={styles.fieldLabel}>Household size</span>
          <div className={styles.sizeControl}>
            <button
              className={styles.stepper}
              onClick={() => updateSettings({ householdSize: Math.max(1, householdSize - 1) })}
              disabled={householdSize <= 1}
              aria-label="Decrease"
            >−</button>
            <span className={styles.sizeValue}>{householdSize}</span>
            <button
              className={styles.stepper}
              onClick={() => updateSettings({ householdSize: householdSize + 1 })}
              aria-label="Increase"
            >+</button>
          </div>
        </div>
      </Card>

      <div className={styles.peopleHeader}>
        <h3 className={styles.subTitle}>People Profiles</h3>
        <Button size="sm" onClick={addPerson}>+ Add Person</Button>
      </div>

      {people.length === 0 && (
        <p className={styles.empty}>No people added yet. Add profiles to enable per-person macro tracking and payday schedules.</p>
      )}

      <div className={styles.peopleList}>
        {people.map(person => (
          <Card key={person.id} padding="sm">
            <div className={styles.personRow}>
              <div className={styles.personInfo}>
                <span className={styles.personName}>{person.name}</span>
                <span className={styles.personMode}>{person.mode} mode</span>
                {person.paydaySchedule && (
                  <span
                    className={styles.paydayDot}
                    style={{ background: person.paydaySchedule.color }}
                    title="Payday schedule configured"
                  />
                )}
              </div>
              <div className={styles.personActions}>
                <Button size="sm" variant="secondary" onClick={() => setEditingPerson(person)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(person.id)}>Remove</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {editingPerson && (
        <PersonModal
          person={editingPerson}
          isNew={isAddingPerson}
          onSave={savePerson}
          onClose={() => { setEditingPerson(null); setIsAddingPerson(false) }}
        />
      )}

      {showDeleteConfirm && (
        <Modal
          open
          onClose={() => setShowDeleteConfirm(null)}
          title="Remove Person"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => deletePerson(showDeleteConfirm)}>Remove</Button>
            </>
          }
        >
          <p>Remove this person from the household? Their macro history will remain but the profile will be deleted.</p>
        </Modal>
      )}
    </div>
  )
}

// ─── Person edit modal ────────────────────────────────────────────────────────
function PersonModal({ person, isNew, onSave, onClose }: {
  person: Person
  isNew: boolean
  onSave: (p: Person) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Person>({ ...person })

  function set<K extends keyof Person>(key: K, value: Person[K]) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  function setPayday<K extends keyof PaydaySchedule>(key: K, value: PaydaySchedule[K]) {
    const existing = draft.paydaySchedule ?? { frequency: 'biweekly', nextPayday: '', color: PAYDAY_COLORS[0] }
    setDraft(d => ({ ...d, paydaySchedule: { ...existing, [key]: value } }))
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add Person' : `Edit ${person.name}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft)}>Save</Button>
        </>
      }
    >
      <div className={styles.personForm}>
        <Input
          label="Name"
          value={draft.name}
          onChange={e => set('name', e.target.value)}
        />

        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Mode</span>
          <div className={styles.radioGroup}>
            {(['simple', 'complex'] as PersonMode[]).map(m => (
              <label key={m} className={styles.radioLabel}>
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={draft.mode === m}
                  onChange={() => set('mode', m)}
                />
                <span>
                  <strong>{m.charAt(0).toUpperCase() + m.slice(1)}</strong>
                  <span className={styles.modeDesc}>
                    {m === 'simple' ? ' — name only, log by servings' : ' — age/weight/height/goals/weight tracking'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {draft.mode === 'complex' && (
          <>
            <div className={styles.row2}>
              <Input label="Age" type="number" min={1} max={120} value={draft.age ?? ''} onChange={e => set('age', +e.target.value || undefined)} />
              <Input label="Weight (lbs)" type="number" min={1} value={draft.weight ?? ''} onChange={e => set('weight', +e.target.value || undefined)} />
            </div>
            <Input label="Height (inches)" type="number" min={1} value={draft.height ?? ''} onChange={e => set('height', +e.target.value || undefined)} />
            <Select label="Sex" options={SEX_OPTIONS} value={draft.sex ?? ''} onChange={e => set('sex', e.target.value as Sex)} />
            <Select label="Activity Level" options={ACTIVITY_OPTIONS} value={draft.activityLevel ?? ''} onChange={e => set('activityLevel', e.target.value as ActivityLevel)} />
            <Toggle label="Track water intake" checked={!!draft.trackWater} onChange={v => set('trackWater', v)} />
            <Toggle label="Track body weight" checked={!!draft.trackWeight} onChange={v => set('trackWeight', v)} />
          </>
        )}

        <div className={styles.paydaySection}>
          <div className={styles.paydayHeader}>
            <span className={styles.fieldLabel}>Payday Schedule</span>
            <Toggle
              checked={!!draft.paydaySchedule}
              onChange={v => set('paydaySchedule', v ? { frequency: 'biweekly', nextPayday: '', color: PAYDAY_COLORS[0] } : undefined)}
            />
          </div>

          {draft.paydaySchedule && (
            <div className={styles.paydayFields}>
              <Select
                label="Frequency"
                options={FREQ_OPTIONS}
                value={draft.paydaySchedule.frequency}
                onChange={e => setPayday('frequency', e.target.value as PayFrequency)}
              />
              <Input
                label="Next Payday"
                type="date"
                value={draft.paydaySchedule.nextPayday}
                onChange={e => setPayday('nextPayday', e.target.value)}
              />
              <div>
                <span className={styles.fieldLabel}>Color</span>
                <div className={styles.colorPicker}>
                  {PAYDAY_COLORS.map(c => (
                    <button
                      key={c}
                      className={`${styles.colorSwatch} ${draft.paydaySchedule?.color === c ? styles.colorSelected : ''}`}
                      style={{ background: c }}
                      onClick={() => setPayday('color', c)}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
