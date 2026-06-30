import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '@/context/SettingsContext'
import {
  importRecipeFromUrl, importRecipeFromText,
  isRecipeImportAvailable, effectiveRecipeAI, recipeAILabel,
} from '@/utils/aiImport'
import type { AIRecipeResult } from '@/utils/aiImport'
import styles from './RecipeImportModal.module.css'

type Tab = 'url' | 'paste'

interface Props {
  onImported: (result: AIRecipeResult) => void
  onManualWithReference: (text: string) => void
  onClose: () => void
}

export function RecipeImportModal({ onImported, onManualWithReference, onClose }: Props) {
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const aiConfigured = isRecipeImportAvailable(settings)
  const aiLabel = recipeAILabel(settings)
  const effectiveAI = effectiveRecipeAI(settings)
  const geminiModel = settings.geminiModel || 'gemini-flash-latest'

  function goToSettings() {
    onClose()
    navigate('/settings')
  }

  async function handleUrlImport() {
    if (!url.trim()) { setError('Please enter a URL.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await importRecipeFromUrl(url.trim(), effectiveAI, geminiModel)
      onImported(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed. Try pasting the text instead.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) { setError('Please paste recipe text.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await importRecipeFromText(pasteText.trim(), effectiveAI, geminiModel)
      onImported(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed. Check your AI provider settings.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Import Recipe">

        <header className={styles.header}>
          <h2 className={styles.title}>Import Recipe</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </header>

        {aiConfigured && aiLabel && (
          <div className={styles.aiBadge}>
            ✨ Powered by {aiLabel}
          </div>
        )}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'url' ? styles.tabActive : ''}`}
            onClick={() => { setTab('url'); setError('') }}
          >
            Import from URL
          </button>
          <button
            className={`${styles.tab} ${tab === 'paste' ? styles.tabActive : ''}`}
            onClick={() => { setTab('paste'); setError('') }}
          >
            Paste Recipe Text
          </button>
        </div>

        <div className={styles.body}>

          {/* ── URL tab ── */}
          {tab === 'url' && aiConfigured && (
            <div className={styles.tabPane}>
              <p className={styles.hint}>
                Paste a recipe URL and the AI will fetch and extract the recipe automatically.
                Some sites block outside access — if it fails, copy the page text and use the Paste tab.
              </p>
              <label className={styles.label}>Recipe URL</label>
              <input
                type="url"
                className={styles.input}
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleUrlImport()}
                placeholder="https://www.example.com/recipe/..."
                autoFocus
                disabled={loading}
              />
              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}

          {tab === 'url' && !aiConfigured && (
            <div className={styles.tabPane}>
              <div className={styles.noAiBox}>
                <p className={styles.noAiTitle}>AI provider required for URL import</p>
                <p className={styles.noAiBody}>
                  Automatically fetching and reading a recipe from a URL requires an AI provider.
                  You can use your free Gemini code — go to Settings → Integrations and enter it in the
                  Google Gemini box. No extra cost, completely free.
                </p>
                <button className={styles.btnSettings} onClick={goToSettings}>
                  Go to Settings → Integrations
                </button>
              </div>

              <div className={styles.divider}>or open it manually</div>

              <div className={styles.manualUrlRow}>
                <label className={styles.label}>Recipe URL</label>
                <div className={styles.urlRow}>
                  <input
                    type="url"
                    className={styles.input}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://www.example.com/recipe/..."
                  />
                  <button
                    className={styles.btnOpenBrowser}
                    onClick={() => url.trim() && window.open(url.trim(), '_blank')}
                    disabled={!url.trim()}
                  >
                    Open in browser ↗
                  </button>
                </div>
                <p className={styles.manualHint}>
                  Open the recipe in your browser, copy the text, then come back and use the
                  <button className={styles.inlineTabLink} onClick={() => setTab('paste')}>
                    Paste text tab
                  </button>
                  to enter it manually.
                </p>
              </div>
            </div>
          )}

          {/* ── Paste tab ── */}
          {tab === 'paste' && aiConfigured && (
            <div className={styles.tabPane}>
              <p className={styles.hint}>
                Copy the full recipe text — ingredients, instructions, and all — then paste it below.
                The AI will parse it into structured fields for you to review.
              </p>
              <label className={styles.label}>Recipe Text</label>
              <textarea
                className={styles.textarea}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste the full recipe text here…"
                rows={12}
                disabled={loading}
                autoFocus={tab === 'paste'}
              />
              {error && <div className={styles.error}>{error}</div>}
            </div>
          )}

          {tab === 'paste' && !aiConfigured && (
            <div className={styles.tabPane}>
              <p className={styles.hint}>
                Paste the recipe text below. We'll show it alongside the recipe editor so you can
                read the original on the left and fill in the fields on the right.
              </p>
              <label className={styles.label}>Recipe Text</label>
              <textarea
                className={styles.textarea}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste the full recipe text here…"
                rows={10}
                autoFocus={tab === 'paste'}
              />
              <div className={styles.noAiPasteHint}>
                <span>
                  With a free Gemini code in Settings → Integrations, we can parse this automatically.{' '}
                  <button className={styles.inlineTabLink} onClick={goToSettings}>
                    Set up Gemini →
                  </button>
                </span>
              </div>
            </div>
          )}

        </div>

        <footer className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Cancel
          </button>

          {/* AI URL import */}
          {tab === 'url' && aiConfigured && (
            <button className={styles.btnImport} onClick={handleUrlImport} disabled={loading || !url.trim()}>
              {loading ? 'Importing…' : 'Import from URL'}
            </button>
          )}

          {/* AI paste import */}
          {tab === 'paste' && aiConfigured && (
            <button className={styles.btnImport} onClick={handlePasteImport} disabled={loading || !pasteText.trim()}>
              {loading ? 'Parsing…' : 'Parse with AI'}
            </button>
          )}

          {/* No AI, paste → open as reference */}
          {tab === 'paste' && !aiConfigured && (
            <button
              className={styles.btnImport}
              onClick={() => { if (pasteText.trim()) { onManualWithReference(pasteText.trim()); onClose() } }}
              disabled={!pasteText.trim()}
            >
              Use as Reference While I Type →
            </button>
          )}
        </footer>

        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              {tab === 'url' ? 'Fetching and parsing recipe…' : 'Parsing recipe text…'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
