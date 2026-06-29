import { useState } from 'react'
import { useSettings } from '@/context/SettingsContext'
import styles from './SetupWizard.module.css'

type Step = 'welcome' | 'name'

export function SetupWizard() {
  const { settings, updateSettings } = useSettings()
  const [step, setStep] = useState<Step>('welcome')
  const [householdName, setHouseholdName] = useState(settings.householdName)

  async function finish() {
    await updateSettings({ householdName: householdName.trim(), setupComplete: true })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {step === 'welcome' && (
          <>
            <div className={styles.icon}>🍽️</div>
            <h1 className={styles.title}>Welcome to Meal Planner</h1>
            <p className={styles.desc}>
              Plan your meals, manage your grocery list, and track your household's nutrition — all in one place.
              Let's get you set up in a few quick steps.
            </p>
            <button className={styles.btnPrimary} onClick={() => setStep('name')}>
              Get Started
            </button>
          </>
        )}

        {step === 'name' && (
          <>
            <div className={styles.icon}>🏠</div>
            <h1 className={styles.title}>Name Your Household</h1>
            <p className={styles.desc}>
              Give your household a name — it'll appear throughout the app as a personal touch.
              You can always change this later in Settings.
            </p>
            <input
              className={styles.nameInput}
              type="text"
              placeholder="e.g. Angelo Family"
              value={householdName}
              onChange={e => setHouseholdName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') finish() }}
              autoFocus
            />
            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep('welcome')}>
                Back
              </button>
              <button className={styles.btnPrimary} onClick={finish}>
                {householdName.trim() ? 'Start Planning' : 'Skip for now'}
              </button>
            </div>
          </>
        )}

        <div className={styles.dots}>
          <span className={`${styles.dot} ${step === 'welcome' ? styles.dotActive : ''}`} />
          <span className={`${styles.dot} ${step === 'name' ? styles.dotActive : ''}`} />
        </div>
      </div>
    </div>
  )
}
