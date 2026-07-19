import { useState, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@/context/SettingsContext'
import { useTheme } from '@/context/ThemeContext'
import { Toggle, Card } from '@/components/ui'
import { AllergenPicker } from '@/components/AllergenChips'
import { HouseholdSection } from './sections/HouseholdSection'
import { AISection } from './sections/AISection'
import { ListsSection } from './sections/ListsSection'
import { DataSection } from './sections/DataSection'
import { SetupChecklist } from './sections/SetupChecklist'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import { Users, Palette, Plug, Salad, List, HardDrive, ScanBarcode } from 'lucide-react'
import styles from './SettingsPage.module.css'
import type { ThemePreference, UnitSystem, KitchenReferencePhotoPolicy } from '@/types'

type Section = 'household' | 'preferences' | 'integrations' | 'nutrients' | 'ingredients' | 'lists' | 'data'

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'household',    label: 'Household',    icon: <Users size={18} /> },
  { id: 'preferences',  label: 'Preferences',  icon: <Palette size={18} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={18} /> },
  { id: 'nutrients',    label: 'Nutrients',    icon: <Salad size={18} /> },
  { id: 'ingredients',  label: 'Ingredients',  icon: <ScanBarcode size={18} /> },
  { id: 'lists',        label: 'Lists',        icon: <List size={18} /> },
  { id: 'data',         label: 'Data',         icon: <HardDrive size={18} /> },
]

const FONT_SIZE_PRESETS: { pt: number; label: string }[] = [
  { pt: 12, label: 'Small' },
  { pt: 14, label: 'Medium' },
  { pt: 16, label: 'Large' },
  { pt: 18, label: 'Extra Large' },
]

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const { preference, setPreference } = useTheme()
  const [active, setActive] = useState<Section>('household')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Settings</h1>
        <PageHelpButton />
      </header>

      <SetupChecklist onSwitchSection={s => setActive(s as Section)} />

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

          {active === 'ingredients' && <IngredientsSection />}

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

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Text Size</span>
            <div className={styles.fontSizePresetRow}>
              {FONT_SIZE_PRESETS.map(preset => (
                <button
                  key={preset.pt}
                  type="button"
                  className={`${styles.fontSizePresetBtn} ${settings.fontSizePt === preset.pt ? styles.fontSizePresetBtnActive : ''}`}
                  onClick={() => updateSettings({ fontSizePt: preset.pt })}
                >
                  {preset.label} ({preset.pt}pt)
                </button>
              ))}
            </div>
            <div className={styles.fontSizeSliderRow}>
              <input
                type="range"
                min={10}
                max={20}
                step={0.5}
                value={settings.fontSizePt ?? 14}
                onChange={e => updateSettings({ fontSizePt: parseFloat(e.target.value) })}
                className={styles.fontSizeSlider}
                aria-label="Custom text size"
              />
              <span className={styles.fontSizeValue}>{settings.fontSizePt ?? 14}pt</span>
            </div>
            <p className={styles.fontSizePreview}>This is what your text will look like at this size</p>
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

          <div className={styles.divider} />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Kitchen Reference Photos</span>
            <div className={styles.radioGroup}>
              {([
                { value: 'ask',     label: 'Always ask' },
                { value: 'keep',    label: 'Always keep photos' },
                { value: 'discard', label: 'Always discard photos after extraction' },
              ] as { value: KitchenReferencePhotoPolicy; label: string }[]).map(opt => (
                <label key={opt.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="kitchenReferencePhotoPolicy"
                    value={opt.value}
                    checked={(settings.kitchenReferencePhotoPolicy ?? 'ask') === opt.value}
                    onChange={() => updateSettings({ kitchenReferencePhotoPolicy: opt.value })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className={styles.fieldHint}>
              Photos are stored locally on your device. Each photo is approximately 1-3MB. Discarding
              photos after text extraction saves significant storage space.
            </div>
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

// ─── Ingredients section ──────────────────────────────────────────────────────
function IngredientsSection() {
  const { settings, updateSettings } = useSettings()
  const { ingredientDisplay, allergenWatchList } = settings

  function toggleDisplay(key: keyof typeof ingredientDisplay) {
    updateSettings({
      ingredientDisplay: { ...ingredientDisplay, [key]: !ingredientDisplay[key] },
    })
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Ingredients</h2>
      <p className={styles.sectionDesc}>
        Control how Nutriscore, Nova processing group, and allergen info show up across the app.
      </p>

      <Card>
        <div className={styles.fieldGroup}>
          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Show Nutriscore grades on ingredient cards</div>
              <div className={styles.fieldHint}>
                A–E nutritional quality badge. <Link to="/help#ingredient-info-nutriscore">Learn more →</Link>
              </div>
            </div>
            <Toggle checked={ingredientDisplay.showNutriscore} onChange={() => toggleDisplay('showNutriscore')} />
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Show Nova Group on ingredient cards</div>
              <div className={styles.fieldHint}>
                1–4 food processing level badge. <Link to="/help#ingredient-info-nova">Learn more →</Link>
              </div>
            </div>
            <Toggle checked={ingredientDisplay.showNovaGroup} onChange={() => toggleDisplay('showNovaGroup')} />
          </div>

          <div className={styles.divider} />

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.fieldLabel}>Show allergen badges on ingredient cards</div>
              <div className={styles.fieldHint}>
                Small chips for any flagged allergens. <Link to="/help#ingredient-info-allergens">Learn more →</Link>
              </div>
            </div>
            <Toggle checked={ingredientDisplay.showAllergens} onChange={() => toggleDisplay('showAllergens')} />
          </div>
        </div>
      </Card>

      <h2 className={styles.sectionTitle} style={{ marginTop: 'var(--space-6)' }}>Allergen Alerts</h2>
      <Card>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Watch for these allergens in the meal planner</div>
          <div className={styles.fieldHint}>
            The meal planner shows a warning icon on any meal that contains one of the allergens
            you select here. None are selected by default — pick the ones that matter to your
            household. <Link to="/help#ingredient-info-allergens">Learn more →</Link>
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <AllergenPicker
              selected={allergenWatchList}
              onChange={list => updateSettings({ allergenWatchList: list })}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
