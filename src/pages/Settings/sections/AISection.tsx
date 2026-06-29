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

const PROVIDER_HINTS: Record<AIProvider, string> = {
  none:      'AI features disabled. You can still enter recipes manually.',
  anthropic: 'Requires an Anthropic API key. Used for recipe import and ingredient parsing.',
  gemini:    'Requires a Google Gemini API key.',
  openai:    'Requires an OpenAI API key.',
  ollama:    'Runs locally — no API key needed. Requires Ollama running on your machine.',
}

export function AISection() {
  const { settings, updateSettings } = useSettings()
  const { ai, usdaApiKey } = settings
  const [showKey, setShowKey] = useState(false)

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
    </div>
  )
}
