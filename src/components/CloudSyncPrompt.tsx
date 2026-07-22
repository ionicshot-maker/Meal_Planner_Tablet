import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '@/context/SettingsContext'
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth'
import { Modal, Button } from '@/components/ui'
import styles from './CloudSyncPrompt.module.css'

// A one-time-per-session nudge toward Cloud Sync for anyone not signed in.
// Gated on setupComplete + starterLibrarySeeded so it can't stack on top of
// SetupWizard/StarterLibraryPrompt — those resolve first. Two independent
// dismiss lifetimes: closing (X, backdrop, Esc, or "Not Now") without
// checking the box only suppresses it for the rest of this app session
// (plain component state, reset on next full load); checking "Don't show
// this again" persists cloudSyncPromptDismissed to this device's settings,
// which is the same flag the standalone Settings toggle controls — so
// either one can turn it back on for the other.
export function CloudSyncPrompt() {
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings()
  const { session, loading: authLoading } = useSupabaseAuth(settings.supabaseUrl, settings.supabaseAnonKey)
  const [sessionDismissed, setSessionDismissed] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const navigate = useNavigate()

  const shouldShow =
    !settingsLoading && !authLoading &&
    settings.setupComplete && settings.starterLibrarySeeded &&
    !session && !settings.cloudSyncPromptDismissed && !sessionDismissed

  async function handleClose() {
    if (dontShowAgain) {
      await updateSettings({ cloudSyncPromptDismissed: true })
    }
    setSessionDismissed(true)
  }

  function handleSignIn() {
    setSessionDismissed(true)
    navigate('/settings?section=data')
  }

  if (!shouldShow) return null

  return (
    <Modal
      open
      onClose={handleClose}
      title="Sync your data across devices?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Not Now</Button>
          <Button onClick={handleSignIn}>Sign In</Button>
        </>
      }
    >
      <div className={styles.body}>
        <p className={styles.desc}>
          Cloud Sync keeps your ingredients, recipes, meal plans, and grocery lists in sync across every
          device in your home. It's entirely optional — everything already works fully offline on this
          device without it.
        </p>
        <p className={styles.desc}>
          Signing in also gives you real control over who can access your data, instead of a shared code
          alone.
        </p>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={e => setDontShowAgain(e.target.checked)}
          />
          Don't show this again
        </label>
      </div>
    </Modal>
  )
}
