import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '@/context/SettingsContext'
import { useSync } from '@/sync/syncContext'
import { Modal, Button } from '@/components/ui'
import styles from './CloudSyncPrompt.module.css'

// A one-time-per-session nudge toward signing in, for anyone not signed in on a device that can reach the household's server
// (with no server behind this address there is nothing to sign in to, so it stays quiet).
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
  const { state } = useSync()
  const [sessionDismissed, setSessionDismissed] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const navigate = useNavigate()

  const shouldShow =
    !settingsLoading &&
    settings.setupComplete && settings.starterLibrarySeeded &&
    state === 'signed-out' && !settings.cloudSyncPromptDismissed && !sessionDismissed

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
      title="Sign in to share your household's data?"
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
          Signing in keeps your ingredients, recipes, meal plans, and grocery lists the same on every
          device in your home, automatically. Everything still works without it — it just stays on this
          device.
        </p>
        <p className={styles.desc}>
          You'll need the username and password your household's owner set up for you.
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
