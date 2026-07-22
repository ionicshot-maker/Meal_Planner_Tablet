import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import { Modal, Button } from '@/components/ui'
import { getAllIngredients } from '@/db/ingredients'
import { seedStarterLibrary, migrateStarterLibrary, STARTER_INGREDIENT_COUNT, LEGACY_FLAT_NAMES } from '@/db/starterLibrary'
import { seedBrandedLibrary, BRANDED_LIBRARY_COUNT } from '@/db/brandedLibrary'
import styles from './StarterLibraryPrompt.module.css'

type Phase = 'idle' | 'prompt' | 'migrating' | 'migration-done'

// Two fully independent starter packs, each tracked by its own settings flag
// (starterLibrarySeeded/-Version for the 101-item USDA set, brandedLibrarySeeded
// for the 867-item Great Value set). The USDA branch below — legacy migration,
// silent auto-seed on an empty install, or falling through to a prompt — is
// unchanged from before the branded pack existed; the branded decision is
// layered on independently and, unlike USDA, NEVER auto-seeds silently — it
// always requires an explicit choice, shown either alongside the USDA prompt
// (both outstanding at once) or on its own (USDA already resolved one way or
// another, including the silent-auto-seed case).
export function StarterLibraryPrompt() {
  const { settings, updateSettings, isLoading } = useSettings()
  const [phase, setPhase] = useState<Phase>('idle')
  const [showUsdaOption, setShowUsdaOption] = useState(false)
  const [showBrandedOption, setShowBrandedOption] = useState(false)
  const [usdaChecked, setUsdaChecked] = useState(true)
  const [brandedChecked, setBrandedChecked] = useState(false)
  const [working, setWorking] = useState(false)
  const [brandedError, setBrandedError] = useState('')
  const checked = useRef(false)
  const updateRef = useRef(updateSettings)
  useEffect(() => { updateRef.current = updateSettings })

  useEffect(() => {
    if (isLoading) return
    const usdaResolved = (settings.starterLibraryVersion ?? 0) >= 2
    const brandedResolved = settings.brandedLibrarySeeded === true
    if (usdaResolved && brandedResolved) return
    if (checked.current) return
    checked.current = true

    ;(async () => {
      let usdaNeedsPrompt = false

      // ── USDA branch — byte-for-byte the same logic as before the branded
      // pack existed, just skipped entirely once already resolved. ──
      if (!usdaResolved) {
        const existing = await getAllIngredients(false)
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
          await new Promise(r => setTimeout(r, 5000))
          setPhase('idle')
        } else if (existing.length === 0) {
          await seedStarterLibrary()
          await updateRef.current({ starterLibraryVersion: 2, starterLibrarySeeded: true })
        } else if (settings.starterLibrarySeeded) {
          await updateRef.current({ starterLibraryVersion: 2 })
        } else {
          usdaNeedsPrompt = true
        }
      }

      // ── Branded branch — always an explicit choice, never silent. ──
      const brandedNeedsPrompt = !brandedResolved

      if (usdaNeedsPrompt || brandedNeedsPrompt) {
        setShowUsdaOption(usdaNeedsPrompt)
        setShowBrandedOption(brandedNeedsPrompt)
        setUsdaChecked(true)
        setBrandedChecked(false)
        setPhase('prompt')
      }
    })()
  }, [isLoading, settings.starterLibraryVersion, settings.starterLibrarySeeded, settings.brandedLibrarySeeded])

  async function handleLoadSelected() {
    // Checkboxes only exist (and only matter) when both packs are shown at
    // once — in single-pack mode the button itself is the unconditional
    // "yes" for that one pack, matching the original single-button behavior.
    const bothShown = showUsdaOption && showBrandedOption
    const doUsda = showUsdaOption && (!bothShown || usdaChecked)
    const doBranded = showBrandedOption && (!bothShown || brandedChecked)

    setWorking(true)
    setBrandedError('')
    try {
      if (doUsda) {
        await seedStarterLibrary()
      }
      if (showUsdaOption) {
        await updateRef.current({ starterLibraryVersion: 2, starterLibrarySeeded: true })
      }

      if (doBranded) {
        await seedBrandedLibrary()
      }
      if (showBrandedOption) {
        await updateRef.current({ brandedLibrarySeeded: true })
      }

      setPhase('idle')
    } catch (e) {
      // USDA (if any) already succeeded and its flag is already set above —
      // only the branded step can fail here (a fetch of the 867-item file).
      // Hide the (already-resolved) USDA option now, so a retry shows just
      // the branded pack — done here rather than right after the USDA save
      // above so the modal's content doesn't visibly shift mid-operation on
      // the (much more common) success path, where it's about to close anyway.
      if (showUsdaOption) setShowUsdaOption(false)
      setBrandedError(e instanceof Error ? e.message : 'Could not load the branded pack. You can try again, or skip it for now.')
    } finally {
      setWorking(false)
    }
  }

  async function handleSkip() {
    const flags: { starterLibraryVersion?: number; starterLibrarySeeded?: boolean; brandedLibrarySeeded?: boolean } = {}
    if (showUsdaOption) { flags.starterLibraryVersion = 2; flags.starterLibrarySeeded = true }
    if (showBrandedOption) { flags.brandedLibrarySeeded = true }
    await updateRef.current(flags)
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

  const bothShown = showUsdaOption && showBrandedOption
  const selectedCount = (showUsdaOption && usdaChecked ? STARTER_INGREDIENT_COUNT : 0)
    + (showBrandedOption && brandedChecked ? BRANDED_LIBRARY_COUNT : 0)
  const loadLabel = working
    ? 'Loading…'
    : bothShown
      ? (selectedCount > 0 ? `Load Selected (${selectedCount})` : 'Continue')
      : showUsdaOption
        ? `Load ${STARTER_INGREDIENT_COUNT} Ingredients`
        : `Load ${BRANDED_LIBRARY_COUNT} Ingredients`

  return (
    <>
      {phase === 'prompt' && (
        <Modal
          open
          onClose={handleSkip}
          title={bothShown ? 'Starter Ingredient Libraries' : showUsdaOption ? 'Starter Ingredient Library' : 'Branded Ingredient Pack'}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={handleSkip} disabled={working}>Skip</Button>
              <Button onClick={handleLoadSelected} disabled={working}>{loadLabel}</Button>
            </>
          }
        >
          <div className={styles.body}>
            {!bothShown && showUsdaOption && (
              <>
                <p className={styles.desc}>
                  We have a pre-built library of {STARTER_INGREDIENT_COUNT} common ingredients with USDA nutritional
                  data — meats, produce, dairy, grains, seasonings, and more — ready to add to your database.
                </p>
                <div className={styles.categories}>
                  {['Meat & Poultry', 'Seafood', 'Eggs', 'Dairy', 'Produce', 'Baking & Pantry', 'Seasonings & Spices', 'Bread & Bakery', 'Condiments & Sauces', 'Beverages'].map(c => (
                    <span key={c} className={styles.chip}>{c}</span>
                  ))}
                </div>
                <p className={styles.note}>
                  Only ingredients not already in your database will be added. You can edit or delete any
                  of them after loading.
                </p>
              </>
            )}

            {!bothShown && showBrandedOption && (
              <>
                <p className={styles.desc}>
                  We also have a bundle of {BRANDED_LIBRARY_COUNT} Great Value branded grocery products
                  (sourced from Open Food Facts) — real barcodes, package sizes, Nutriscore/Nova ratings,
                  and allergen info included where available.
                </p>
                <p className={styles.note}>
                  This is a much bigger, single-store dataset — only add it if Great Value / Walmart
                  products match your household's actual shopping. Only products not already in your
                  database will be added (matched by barcode where possible, then by name).
                </p>
                {brandedError && <p className={styles.error}>{brandedError}</p>}
              </>
            )}

            {bothShown && (
              <>
                <p className={styles.desc}>
                  Two optional starter packs are available — load either, both, or neither.
                </p>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" checked={usdaChecked} onChange={e => setUsdaChecked(e.target.checked)} />
                  <span>
                    <strong>{STARTER_INGREDIENT_COUNT} USDA basics</strong> — generic raw ingredients
                    (meats, produce, dairy, grains, seasonings) with USDA nutritional data, no brand or price info.
                  </span>
                </label>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" checked={brandedChecked} onChange={e => setBrandedChecked(e.target.checked)} />
                  <span>
                    <strong>{BRANDED_LIBRARY_COUNT} Great Value branded products</strong> — real packaged
                    grocery items with barcodes, Nutriscore/Nova ratings, and allergen info where available.
                  </span>
                </label>
                <p className={styles.note}>
                  Only items not already in your database will be added, either way. You can edit or
                  delete any of them after loading.
                </p>
                {brandedError && <p className={styles.error}>{brandedError}</p>}
              </>
            )}
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
