import { useState, useEffect } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { useGeminiModelDiscovery, type FetchedGeminiModel } from '@/hooks/useGeminiModelDiscovery'
import { Button, Card, Input, Select, Modal } from '@/components/ui'
import { GEMINI_PRIMARY_MODEL } from '@/utils/geminiModel'
import type { AIProvider } from '@/types'
import styles from './AISection.module.css'

const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
  { value: 'none',      label: 'None — manual entry only' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'gemini',    label: 'Google Gemini' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'ollama',    label: 'Ollama (local / free)' },
]

// The curated/recommended set — which ids appear as chips is still a
// maintained list, per the Phase 3 design review. Only the *displayName*
// is sourced from live discovery now (see FALLBACK_DISPLAY_NAMES below for
// why a hardcoded name is still kept per id, not dropped).
const RECOMMENDED_MODEL_IDS: string[] = [
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
]

// Google's discovery endpoint has no rate-limit/pricing-tier field (confirmed
// during the Dynamic Gemini Model Discovery investigation) - these badges are
// curated knowledge that live data can never supply, so they stay hardcoded
// independent of the displayName sourcing change.
const RECOMMENDED_MODEL_BADGES: Record<string, string> = {
  'gemini-3-flash-preview': 'Preview',
}

// Shown until live discovery data confirms (or replaces) a name - covers both
// "haven't checked yet" and "Google's list no longer includes this id"
// without treating either as an error; the existing availability checkmark
// already signals the latter, so no separate greyed-out/hidden treatment
// is needed here.
const FALLBACK_DISPLAY_NAMES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3-flash': 'Gemini 3 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
}

const PROVIDER_HINTS: Record<AIProvider, string> = {
  none:      "Main AI provider disabled — you can still enter recipes manually. (This doesn't affect Gemini-based features, which use their own separate key.)",
  anthropic: 'Requires an Anthropic API key. Used for recipe import and ingredient parsing.',
  gemini:    'Requires a Google Gemini API key.',
  openai:    'Requires an OpenAI API key.',
  ollama:    'Runs locally — no API key needed. Requires Ollama running on your machine.',
}

const SUPABASE_HINT = 'Get a free account at supabase.com — create a project, then go to Project Settings → API.'

const BROWSE_ALL_GUIDANCE = `This list includes every model Google reports as text-capable. Not all are suited for photo/recipe extraction — look for names containing "flash" or "pro" rather than "tts", "image", "robotics", or "agent".`

interface ModelGroup { label: string; models: FetchedGeminiModel[] }

// Purely syntactic grouping (a version number right after "gemini-"/"gemma-")
// so newly-released model families cluster automatically without needing a
// maintained list of family names - the same staleness problem the original
// investigation flagged against filtering by hardcoded category.
function groupModelsByFamily(models: FetchedGeminiModel[]): ModelGroup[] {
  const groups = new Map<string, FetchedGeminiModel[]>()
  for (const m of models) {
    const match = m.id.match(/^(gemini|gemma)-(\d+(?:\.\d+)?)/)
    const label = match ? `${match[1] === 'gemma' ? 'Gemma' : 'Gemini'} ${match[2]}` : 'Other'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(m)
  }
  for (const group of groups.values()) group.sort((a, b) => a.id.localeCompare(b.id))
  const entries = [...groups.entries()].map(([label, groupModels]) => ({ label, models: groupModels }))
  entries.sort((a, b) => {
    if (a.label === 'Other') return 1
    if (b.label === 'Other') return -1
    const [aFam, aVer] = a.label.split(' ')
    const [bFam, bVer] = b.label.split(' ')
    if (aFam !== bFam) return aFam === 'Gemini' ? -1 : 1
    return parseFloat(bVer) - parseFloat(aVer)
  })
  return entries
}

export function AISection() {
  const { settings, updateSettings } = useSettings()
  const { ai, usdaApiKey, geminiApiKey, geminiModel } = settings
  const [showKey, setShowKey] = useState(false)
  const [showBrowseAll, setShowBrowseAll] = useState(false)
  const { models: fetchedModels, loading: modelFetchLoading, error: modelFetchError, fetchModels } = useGeminiModelDiscovery()

  const fetchedModelsById = new Map(fetchedModels.map(m => [m.id, m]))

  // Auto-fetch the moment the browse-all modal opens, rather than requiring
  // the user to have already clicked "Check available models" separately -
  // browsing IS the point of this modal, so it shouldn't need a second,
  // earlier step first. Guarded on fetchedModels being empty so reopening an
  // already-fetched list doesn't re-fetch. Intentionally only depends on
  // showBrowseAll (not modelFetchLoading/fetchedModels) so a failed fetch
  // doesn't retry in a loop every time those internal states change.
  useEffect(() => {
    if (showBrowseAll && fetchedModels.length === 0 && !modelFetchLoading && geminiApiKey) {
      fetchModels(geminiApiKey)
    }
  }, [showBrowseAll]) // eslint-disable-line react-hooks/exhaustive-deps

  const modelGroups = groupModelsByFamily(fetchedModels)

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Integrations</h2>

      <h3 className={styles.subTitle}>AI Provider</h3>
      <p className={styles.desc}>
        Used for recipe import (URL or pasted text) and missing ingredient parsing. Fully optional.
      </p>

      <Card>
        <div className={styles.fieldGroup}>
          <Select
            label="Provider"
            options={PROVIDER_OPTIONS}
            value={ai.provider}
            onChange={e => updateSettings({ ai: { ...ai, provider: e.target.value as AIProvider, apiKey: '' } })}
          />
          <p className={styles.hint}>{PROVIDER_HINTS[ai.provider]}</p>

          {ai.provider !== 'none' && ai.provider !== 'ollama' && (
            <div className={styles.keyRow}>
              <Input
                label="API Key"
                type={showKey ? 'text' : 'password'}
                value={ai.apiKey}
                onChange={e => updateSettings({ ai: { ...ai, apiKey: e.target.value } })}
                placeholder="Paste your API key"
              />
              <Button
                variant="ghost"
                size="sm"
                className={styles.showBtn}
                onClick={() => setShowKey(v => !v)}
              >
                {showKey ? 'Hide' : 'Show'}
              </Button>
            </div>
          )}

          {ai.provider === 'ollama' && (
            <>
              <Input
                label="Ollama Base URL"
                value={ai.ollamaBaseUrl ?? 'http://localhost:11434'}
                onChange={e => updateSettings({ ai: { ...ai, ollamaBaseUrl: e.target.value } })}
                hint="Default: http://localhost:11434"
              />
              <Input
                label="Model"
                value={ai.ollamaModel ?? 'llama3'}
                onChange={e => updateSettings({ ai: { ...ai, ollamaModel: e.target.value } })}
                hint="e.g. llama3, mistral, phi3"
              />
            </>
          )}

          {ai.provider !== 'none' && ai.provider !== 'ollama' && ai.apiKey && (
            <p className={styles.keyStored}>
              API key stored locally on this device only. When you use AI features, the key is sent through our server to reach your chosen AI provider.
            </p>
          )}
        </div>
      </Card>

      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>USDA FoodData Central</h3>
      <p className={styles.desc}>
        Free API for auto-filling macros on raw ingredients. An API key is optional but recommended to avoid rate limits.
      </p>

      <Card>
        <div className={styles.keyRow}>
          <Input
            label="USDA API Key (optional)"
            type={showKey ? 'text' : 'password'}
            value={usdaApiKey}
            onChange={e => updateSettings({ usdaApiKey: e.target.value })}
            placeholder="Leave blank to use the demo key"
            hint="Get a free key at api.nal.usda.gov"
          />
          <Button variant="ghost" size="sm" className={styles.showBtn} onClick={() => setShowKey(v => !v)}>
            {showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
      </Card>

      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Google Gemini (Nutrition Lookup)</h3>
      <p className={styles.desc}>
        Used to auto-fill nutrition facts for packaged products when barcode data is missing.
        Free at <strong>aistudio.google.com</strong>. Fully optional — falls back to USDA search if not configured.
      </p>

      <Card>
        <div className={styles.fieldGroup}>
          <div className={styles.keyRow}>
            <Input
              label="Google Gemini API Key (optional)"
              type={showKey ? 'text' : 'password'}
              value={geminiApiKey}
              onChange={e => updateSettings({ geminiApiKey: e.target.value })}
              placeholder="Get a free key at aistudio.google.com"
            />
            <Button variant="ghost" size="sm" className={styles.showBtn} onClick={() => setShowKey(v => !v)}>
              {showKey ? 'Hide' : 'Show'}
            </Button>
          </div>

          <div className={styles.modelChipsGroup}>
            <span className={styles.modelChipsLabel}>Gemini Model</span>
            <div className={styles.modelChips}>
              {RECOMMENDED_MODEL_IDS.map(id => {
                const fetched = fetchedModelsById.get(id)
                const displayName = fetched?.displayName ?? FALLBACK_DISPLAY_NAMES[id] ?? id
                const badge = RECOMMENDED_MODEL_BADGES[id] ?? ''
                const isActive = (geminiModel || GEMINI_PRIMARY_MODEL) === id
                const isAvail  = fetchedModelsById.has(id)
                return (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.modelChip} ${isActive ? styles.modelChipActive : ''}`}
                    onClick={() => updateSettings({ geminiModel: id })}
                  >
                    <span className={styles.modelChipName}>{displayName}</span>
                    {badge && <span className={styles.modelChipBadge}>{badge}</span>}
                    {isAvail && <span className={styles.modelChipAvail} title="Available on your account">✓</span>}
                  </button>
                )
              })}
            </div>
            <p className={styles.hint}>
              Any of these models will work well. Exact free-tier limits are set by Google and can
              change — check Google's current rate limits and pricing if that matters for your use.
            </p>
            <div className={styles.modelCheckRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchModels(geminiApiKey)}
                disabled={!geminiApiKey || modelFetchLoading}
              >
                {modelFetchLoading ? 'Checking…' : 'Check available models'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBrowseAll(true)}
                disabled={!geminiApiKey}
              >
                Browse all models
              </Button>
              {fetchedModels.length > 0 && (
                <span className={styles.modelAvailResult}>
                  {RECOMMENDED_MODEL_IDS.filter(id => fetchedModelsById.has(id)).length} of {RECOMMENDED_MODEL_IDS.length} preset models available on your account
                </span>
              )}
            </div>
            {modelFetchError && <p className={styles.modelError}>{modelFetchError}</p>}
            {settings.lastGeminiResolution && (
              <p className={styles.hint}>
                Last Gemini call used{' '}
                <strong>
                  {FALLBACK_DISPLAY_NAMES[settings.lastGeminiResolution.usedModel] ?? settings.lastGeminiResolution.usedModel}
                </strong>
                {settings.lastGeminiResolution.didFallback && (
                  <>
                    {' '}— your selected model (
                    {FALLBACK_DISPLAY_NAMES[settings.lastGeminiResolution.requestedModel] ?? settings.lastGeminiResolution.requestedModel}
                    ) wasn't available, so this ran instead.
                  </>
                )}
              </p>
            )}
          </div>

          <Modal
            open={showBrowseAll}
            onClose={() => setShowBrowseAll(false)}
            title="Browse All Gemini Models"
            size="lg"
            footer={<Button variant="secondary" onClick={() => setShowBrowseAll(false)}>Close</Button>}
          >
            <p className={styles.browseAllGuidance}>{BROWSE_ALL_GUIDANCE}</p>
            {modelFetchLoading && <p className={styles.hint}>Loading available models…</p>}
            {modelFetchError && <p className={styles.modelError}>{modelFetchError}</p>}
            {!modelFetchLoading && !modelFetchError && fetchedModels.length === 0 && (
              <p className={styles.hint}>No models loaded yet.</p>
            )}
            {modelGroups.map(group => (
              <div key={group.label} className={styles.browseAllGroup}>
                <h4 className={styles.browseAllGroupLabel}>{group.label}</h4>
                <div className={styles.browseAllList}>
                  {group.models.map(m => {
                    const isActive = (geminiModel || GEMINI_PRIMARY_MODEL) === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`${styles.browseAllItem} ${isActive ? styles.browseAllItemActive : ''}`}
                        onClick={() => { updateSettings({ geminiModel: m.id }); setShowBrowseAll(false) }}
                      >
                        <span>{m.displayName}</span>
                        {isActive && <span className={styles.modelChipAvail}>✓ current</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </Modal>

          {geminiApiKey && (
            <p className={styles.keyStored}>
              Key stored locally on this device only. Also used for recipe import when no other AI provider is set.
            </p>
          )}
        </div>
      </Card>

      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Supabase (Cloud Sync)</h3>
      <p className={styles.desc}>
        Required for cloud sync between devices and family sharing. Free at <strong>supabase.com</strong>.
        {' '}After setting up, go to <strong>Settings → Data → Cloud Sync</strong> to configure sync codes.
      </p>

      <Card>
        <div className={styles.fieldGroup}>
          <Input
            label="Supabase Project URL"
            value={settings.supabaseUrl ?? ''}
            onChange={e => updateSettings({ supabaseUrl: e.target.value })}
            placeholder="https://xxxx.supabase.co"
            hint={SUPABASE_HINT}
          />
          <div className={styles.keyRow}>
            <Input
              label="Supabase Anon Key"
              type={showKey ? 'text' : 'password'}
              value={settings.supabaseAnonKey ?? ''}
              onChange={e => updateSettings({ supabaseAnonKey: e.target.value })}
              placeholder="eyJ..."
              hint="Copy the anon/public key from Project Settings → API → Project API keys."
            />
            <Button variant="ghost" size="sm" className={styles.showBtn} onClick={() => setShowKey(v => !v)}>
              {showKey ? 'Hide' : 'Show'}
            </Button>
          </div>
          {settings.supabaseUrl && settings.supabaseAnonKey && (
            <p className={styles.keyStored}>Supabase credentials stored locally. Never shared with anyone except Supabase.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
