import { useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { useTheme } from '@/context/ThemeContext'
import { Toggle, Card } from '@/components/ui'
import { HouseholdSection } from './sections/HouseholdSection'
import { AISection } from './sections/AISection'
import { ListsSection } from './sections/ListsSection'
import { DataSection } from './sections/DataSection'
import styles from './SettingsPage.module.css'
import type { ThemePreference, UnitSystem } from '@/types'

type Section = 'household' | 'preferences' | 'integrations' | 'nutrients' | 'lists' | 'data'

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'household',    label: 'Household',    icon: '👥' },
  { id: 'preferences',  label: 'Preferences',  icon: '🎨' },
  { id: 'integrations', label: 'Integrations', icon: '🔌' },
  { id: 'nutrients',    label: 'Nutrients',    icon: '🥗' },
  { id: 'lists',        label: 'Lists',        icon: '📋' },
  { id: 'data',         label: 'Data',         icon: '💾' },
]

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const { preference, setPreference } = useTheme()
  const [active, setActive] = useState<Section>('household')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Settings</h1>
      </header>

      <div className={styles.layout}>
        {/* Section tabs */}
        <nav className={styles.tabs} aria-label="Settings sections">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`${styles.tab} ${active === s.id ? styles.tabActive : ''}`}
              onClick={() => setActive(s.id)}
            >
              <span className={styles.tabIcon} aria-hidden="true">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className={styles.content}>
          {active === 'household' && <HouseholdSection />}

          {active === 'preferences' && (
            <PreferencesSection
              unitSystem={settings.unitSystem}
              theme={preference}
              onUnitChange={u => updateSettings({ unitSystem: u })}
              onThemeChange={setPreference}
            />
          )}

          {active === 'integrations' && <AISection />}

          {active === 'nutrients' && (
            <NutrientsSection />
          )}

          {active === 'lists' && <ListsSection />}

          {active === 'data' && <DataSection />}
        </div>
      </div>
    </div>
  )
}

// ─── Preferences section ─────────────────────────────────────────────────────
function PreferencesSection({
  unitSystem, theme, onUnitChange, onThemeChange,
}: {
  unitSystem: UnitSystem
  theme: ThemePreference
  onUnitChange: (u: UnitSystem) => void
  onThemeChange: (t: ThemePreference) => void
}) {
  const { settings, updateSettings } = useSettings()

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Preferences</h2>

      <Card>
        <div className={styles.fieldGroup}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Unit System</span>
            <div className={styles.radioGroup}>
              {(['imperial', 'metric'] as UnitSystem[]).map(u => (
                <label key={u} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="unitSystem"
                    value={u}
                    checked={unitSystem === u}
                    onChange={() => onUnitChange(u)}
                  />
                  {u.charAt(0).toUpperCase() + u.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Theme</span>
            <div className={styles.radioGroup}>
              {([
                { value: 'light', label: 'Light' },
                { value: 'dark',  label: 'Dark' },
                { value: 'system',label: 'System' },
              ] as { value: ThemePreference; label: string }[]).map(opt => (
                <label key={opt.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="theme"
                    value={opt.value}
                    checked={theme === opt.value}
                    onChange={() => onThemeChange(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Store Preference</div>
              <div className={styles.fieldHint}>Enable a "store" field per ingredient for organized grocery lists</div>
            </div>
            <Toggle
              checked={settings.storePreferenceEnabled}
              onChange={v => updateSettings({ storePreferenceEnabled: v })}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Nutrients section ────────────────────────────────────────────────────────
function NutrientsSection() {
  const { settings, updateSettings } = useSettings()
  const { nutrientToggles, macroHistoryDays } = settings

  function toggle(key: keyof typeof nutrientToggles) {
    updateSettings({
      nutrientToggles: { ...nutrientToggles, [key]: !nutrientToggles[key] },
    })
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Optional Nutrients</h2>
      <p className={styles.sectionDesc}>
        These nutrients are tracked app-wide. Toggle to show or hide them across ingredients, recipes, and macro logging.
      </p>

      <Card>
        <div className={styles.fieldGroup}>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Saturated Fat</div>
              <div className={styles.fieldHint}>Tracked per serving</div>
            </div>
            <Toggle
              checked={nutrientToggles.saturatedFat}
              onChange={() => toggle('saturatedFat')}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Trans Fat</div>
              <div className={styles.fieldHint}>Tracked per serving</div>
            </div>
            <Toggle
              checked={nutrientToggles.transFat}
              onChange={() => toggle('transFat')}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Alcohol (grams)</div>
              <div className={styles.fieldHint}>7 cal/gram — adds grams as a tracked field</div>
            </div>
            <Toggle
              checked={nutrientToggles.alcohol}
              onChange={() => toggle('alcohol')}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Water Intake</div>
              <div className={styles.fieldHint}>Daily total (oz or ml) — per person optional</div>
            </div>
            <Toggle
              checked={nutrientToggles.water}
              onChange={() => toggle('water')}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Weight Tracking</div>
              <div className={styles.fieldHint}>Complex mode only — log weight over time</div>
            </div>
            <Toggle
              checked={nutrientToggles.weight}
              onChange={() => toggle('weight')}
            />
          </div>
        </div>
      </Card>

      <h2 className={styles.sectionTitle} style={{ marginTop: 'var(--space-6)' }}>History Retention</h2>
      <Card>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="historyDays">
            Macro history saved for
          </label>
          <div className={styles.historyRow}>
            <input
              id="historyDays"
              type="number"
              min={30}
              max={365}
              value={macroHistoryDays}
              onChange={e => updateSettings({ macroHistoryDays: Math.min(365, Math.max(30, +e.target.value)) })}
              className={styles.historyInput}
            />
            <span className={styles.fieldHint}>days (30–365, default 90)</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
