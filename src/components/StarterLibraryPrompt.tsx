import { useState, useEffect, useRef } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { Modal, Button } from '@/components/ui'
import { getAllIngredients } from '@/db/ingredients'
import { seedStarterLibrary, STARTER_INGREDIENT_COUNT } from '@/db/starterLibrary'
import styles from './StarterLibraryPrompt.module.css'

export function StarterLibraryPrompt() {
  const { settings, updateSettings, isLoading } = useSettings()
  const [show, setShow] = useState(false)
  const [working, setWorking] = useState(false)
  const checked = useRef(false)
  const updateRef = useRef(updateSettings)
  useEffect(() => { updateRef.current = updateSettings })

  useEffect(() => {
    if (isLoading) return
    if (settings.starterLibrarySeeded) return
    if (checked.current) return
    checked.current = true

    getAllIngredients(false).then(existing => {
      if (existing.length === 0) {
        seedStarterLibrary().then(() => {
          updateRef.current({ starterLibrarySeeded: true })
        })
      } else {
        setShow(true)
      }
    })
  }, [isLoading, settings.starterLibrarySeeded])

  async function handleLoad() {
    setWorking(true)
    await seedStarterLibrary()
    await updateRef.current({ starterLibrarySeeded: true })
    setShow(false)
    setWorking(false)
  }

  async function handleSkip() {
    await updateRef.current({ starterLibrarySeeded: true })
    setShow(false)
  }

  if (!show) return null

  return (
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
  )
}
