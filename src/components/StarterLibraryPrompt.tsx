import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import { Modal, Button } from '@/components/ui'
import { getAllIngredients } from '@/db/ingredients'
import { seedStarterLibrary, migrateStarterLibrary, STARTER_INGREDIENT_COUNT, LEGACY_FLAT_NAMES } from '@/db/starterLibrary'
import styles from './StarterLibraryPrompt.module.css'

type Phase = 'idle' | 'prompt' | 'migrating' | 'migration-done'

export function StarterLibraryPrompt() {
  const { settings, updateSettings, isLoading } = useSettings()
  const [phase, setPhase] = useState<Phase>('idle')
  const [working, setWorking] = useState(false)
  const checked = useRef(false)
  const updateRef = useRef(updateSettings)
  useEffect(() => { updateRef.current = updateSettings })

  useEffect(() => {
    if (isLoading) return
    if ((settings.starterLibraryVersion ?? 0) >= 2) return
    if (checked.current) return
    checked.current = true

    getAllIngredients(false).then(async existing => {
      const legacySet = new Set(LEGACY_FLAT_NAMES.map(n => n.toLowerCase()))
      const legacyMatches = existing.filter(ing =>
        legacySet.has(ing.name.toLowerCase()) &&
        ing.variants.length === 1 &&
        ing.variants[0].brand.toLowerCase() === 'generic'
      )

      if (legacyMatches.length > 0) {
        setPhase('migrating')
        await migrateStarterLibrary()
        await updateRef.current({ starterLibraryVersion: 2, starterLibrarySeeded: true })
        setPhase('migration-done')
        setTimeout(() => setPhase('idle'), 5000)
      } else if (existing.length === 0) {
        await seedStarterLibrary()
        await updateRef.current({ starterLibraryVersion: 2, starterLibrarySeeded: true })
      } else if (settings.starterLibrarySeeded) {
        await updateRef.current({ starterLibraryVersion: 2 })
      } else {
        setPhase('prompt')
      }
    })
  }, [isLoading, settings.starterLibraryVersion, settings.starterLibrarySeeded])

  async function handleLoad() {
    setWorking(true)
    await seedStarterLibrary()
    await updateRef.current({ starterLibraryVersion: 2, starterLibrarySeeded: true })
    setPhase('idle')
    setWorking(false)
  }

  async function handleSkip() {
    await updateRef.current({ starterLibraryVersion: 2, starterLibrarySeeded: true })
    setPhase('idle')
  }

  const toastStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'var(--space-4)', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.16)', fontSize: 'var(--text-sm)',
    color: 'var(--color-text)', zIndex: 9999,
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', maxWidth: '420px',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      {phase === 'prompt' && (
        <Modal
          open
          onClose={handleSkip}
          title="Starter Ingredient Library"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={handleSkip} disabled={working}>Skip</Button>
              <Button onClick={handleLoad} disabled={working}>
                {working ? 'Loading…' : `Load ${STARTER_INGREDIENT_COUNT} Ingredients`}
              </Button>
            </>
          }
        >
          <div className={styles.body}>
            <p className={styles.desc}>
              We have a pre-built library of {STARTER_INGREDIENT_COUNT} common ingredients with USDA nutritional
              data — meats, produce, dairy, grains, seasonings, and more — ready to add to your database.
            </p>
            <div className={styles.categories}>
              {['Meat', 'Seafood', 'Eggs', 'Dairy', 'Produce', 'Pantry', 'Seasonings', 'Bakery', 'Condiments', 'Beverages'].map(c => (
                <span key={c} className={styles.chip}>{c}</span>
              ))}
            </div>
            <p className={styles.note}>
              Only ingredients not already in your database will be added. You can edit or delete any
              of them after loading.
            </p>
          </div>
        </Modal>
      )}
      {phase === 'migrating' && createPortal(
        <div style={toastStyle}>
          <span>Updating ingredient library…</span>
        </div>,
        document.body
      )}
      {phase === 'migration-done' && createPortal(
        <div style={toastStyle}>
          <span style={{ color: 'var(--color-success)' }}>✓</span>
          Starter ingredient library updated — related ingredients are now grouped together.
        </div>,
        document.body
      )}
    </>
  )
}
