import { useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { Button, Card, Input, Select } from '@/components/ui'
import type { AIProvider } from '@/types'
import styles from './AISection.module.css'

const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
  { value: 'none',      label: 'None — manual entry only' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'gemini',    label: 'Google Gemini' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'ollama',    label: 'Ollama (local / free)' },
]

const GEMINI_MODELS: { id: string; name: string; badge: string }[] = [
  { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      badge: 'Recommended' },
  { id: 'gemini-2.0-flash',      name: 'Gemini 2.0 Flash',      badge: '' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', badge: 'Most Free Requests' },
  { id: 'gemini-flash-latest',   name: 'Latest Flash',           badge: 'May Change' },
  { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',         badge: '50/day limit' },
]

const PROVIDER_HINTS: Record<AIProvider, string> = {
  none:      'AI features disabled. You can still enter recipes manually.',
  anthropic: 'Requires an Anthropic API key. Used for recipe import and ingredient parsing.',
  gemini:    'Requires a Google Gemini API key.',
  openai:    'Requires an OpenAI API key.',
  ollama:    'Runs locally — no API key needed. Requires Ollama running on your machine.',
}

interface FetchedModel { id: string; displayName: string }

const SUPABASE_HINT = 'Get a free account at supabase.com — create a project, then go to Project Settings → API.'

export function AISection() {
  const { settings, updateSettings } = useSettings()
  const { ai, usdaApiKey, geminiApiKey, geminiModel } = settings
  const [showKey, setShowKey] = useState(false)
  const [modelFetchLoading, setModelFetchLoading] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([])
  const [modelFetchError, setModelFetchError] = useState('')

  const availableModelIds = new Set(fetchedModels.map(m => m.id))

  async function handleFetchModels() {
    if (!geminiApiKey) return
    setModelFetchLoading(true)
    setModelFetchError('')
    setFetchedModels([])
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiApiKey)}`
      )
      if (!res.ok) {
        const text = await res.text()
        setModelFetchError(`API returned ${res.status} — check your API key.`)
        console.error('[AISection] model list error:', text)
        return
      }
      const json = await res.json() as {
        models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>
      }
      const generationModels = (json.models ?? [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => ({
          id: m.name.replace('models/', ''),
          displayName: m.displayName ?? m.name.replace('models/', ''),
        }))
      if (generationModels.length === 0) {
        setModelFetchError('No generateContent models found for this key.')
        return
      }
      setFetchedModels(generationModels)
    } catch (e) {
      setModelFetchError(`Could not reach Gemini API: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setModelFetchLoading(false)
    }
  }

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
              API key stored locally on this device only. Never sent to any server except your chosen AI provider.
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
              {GEMINI_MODELS.map(m => {
                const isActive = (geminiModel || 'gemini-2.5-flash') === m.id
                const isAvail  = availableModelIds.has(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`${styles.modelChip} ${isActive ? styles.modelChipActive : ''}`}
                    onClick={() => updateSettings({ geminiModel: m.id })}
                  >
                    <span className={styles.modelChipName}>{m.name}</span>
                    {m.badge && <span className={styles.modelChipBadge}>{m.badge}</span>}
                    {isAvail && <span className={styles.modelChipAvail} title="Available on your account">✓</span>}
                  </button>
                )
              })}
            </div>
            <p className={styles.hint}>
              Not sure which to use? Start with Gemini 2.5 Flash. If you hit rate limits try Gemini 2.0 Flash Lite.
            </p>
            <div className={styles.modelCheckRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFetchModels}
                disabled={!geminiApiKey || modelFetchLoading}
              >
                {modelFetchLoading ? 'Checking…' : 'Check available models'}
              </Button>
              {fetchedModels.length > 0 && (
                <span className={styles.modelAvailResult}>
                  {GEMINI_MODELS.filter(m => availableModelIds.has(m.id)).length} of {GEMINI_MODELS.length} preset models available on your account
                </span>
              )}
            </div>
            {modelFetchError && <p className={styles.modelError}>{modelFetchError}</p>}
          </div>

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
