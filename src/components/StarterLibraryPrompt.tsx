import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import { Modal, Button, OperationStatus } from '@/components/ui'
import type { OperationState, OperationProgress } from '@/components/ui'
import { getAllIngredients } from '@/db/ingredients'
import { seedStarterLibrary, migrateStarterLibrary, STARTER_INGREDIENT_COUNT, LEGACY_FLAT_NAMES } from '@/db/starterLibrary'
import { seedBrandedLibrary, BRANDED_LIBRARY_COUNT } from '@/db/brandedLibrary'
import styles from './StarterLibraryPrompt.module.css'

type Phase = 'idle' | 'prompt' | 'migrating' | 'migration-done' | 'auto-seed-error'

// Bumped 2026-07-24: the USDA set grew from 101 to 440 items (339 new
// entries merged in from a comprehensive USDA import — see
// MealPlannerApp_Reference.md). Anyone already at version 2 (the old
// 101-item schema) is neither silently topped up (would add ~339
// ingredients with zero confirmation, even for someone who explicitly
// declined the original 101) nor silently left behind forever (the old
// code's `usdaResolved` gate would never re-run this branch once true) —
// they're offered the delta via a distinctly-worded "library has grown"
// prompt (see usdaGrowthOffer below). seedStarterLibrary() is dedup-safe by
// name against the household's full live ingredient list, so accepting
// can't create duplicates for anyone who already has some of these 339
// from another import (e.g. the JSON Import of this same source file).
const CURRENT_STARTER_VERSION = 3

// Category chips shown in the USDA prompt — a curated display list, NOT
// auto-derived from DEFS (checked, confirmed, 2026-07-24). Must be updated
// by hand whenever DEFS's category coverage changes. The 339-item merge
// introduced 4 categories the old list didn't have: Rice & Grains, Dry
// Beans & Legumes, Pasta & Noodles, Soups & Broths.
const USDA_CATEGORY_CHIPS = [
  'Meat & Poultry', 'Seafood', 'Eggs', 'Dairy', 'Produce',
  'Rice & Grains', 'Dry Beans & Legumes', 'Pasta & Noodles',
  'Baking & Pantry', 'Seasonings & Spices', 'Bread & Bakery',
  'Condiments & Sauces', 'Soups & Broths', 'Beverages',
]

// Two fully independent starter packs, each tracked by its own settings flag
// (starterLibrarySeeded/-Version for the USDA set, brandedLibrarySeeded
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
  const [showUsdaGrowthOffer, setShowUsdaGrowthOffer] = useState(false)
  const [showBrandedOption, setShowBrandedOption] = useState(false)
  const [usdaChecked, setUsdaChecked] = useState(true)
  const [brandedChecked, setBrandedChecked] = useState(false)
  const [opState, setOpState] = useState<OperationState>('idle')
  const [opProgress, setOpProgress] = useState<OperationProgress | undefined>(undefined)
  const [opDoneMessage, setOpDoneMessage] = useState('')
  const [opErrorMessage, setOpErrorMessage] = useState('')
  const [migrateProgress, setMigrateProgress] = useState<OperationProgress | undefined>(undefined)
  const [autoSeedError, setAutoSeedError] = useState('')
  const checked = useRef(false)
  const updateRef = useRef(updateSettings)
  useEffect(() => { updateRef.current = updateSettings })

  useEffect(() => {
    if (isLoading) return
    const usdaResolved = (settings.starterLibraryVersion ?? 0) >= CURRENT_STARTER_VERSION
    const brandedResolved = settings.brandedLibrarySeeded === true
    if (usdaResolved && brandedResolved) return
    if (checked.current) return
    checked.current = true

    ;(async () => {
      // Whole body wrapped in try/catch — previously this ran completely
      // unguarded. Either sub-path here can throw (seedStarterLibrary()'s
      // own per-item loop, migrateStarterLibrary()'s delete-then-reseed),
      // and an unhandled rejection from this effect would silently strand
      // the UI: most visibly for the migration branch, where
      // setPhase('migrating') has already put the "Updating ingredient
      // library…" toast on screen with nothing left to ever clear it. The
      // plain-auto-seed branch (existing.length === 0) shows no UI at all
      // either way, so a failure there is invisible in the moment, but
      // still worth catching rather than leaving an unhandled rejection in
      // the console — and it's naturally self-healing regardless: the
      // version/seeded flags are only set AFTER seedStarterLibrary()
      // resolves, so a failure partway through leaves them unset, meaning
      // the next app load either retries the silent seed (if still
      // nothing local) or falls through to the explicit prompt below
      // (since some ingredients are now present) — either way the
      // household isn't left silently short of default ingredients
      // forever, and seedStarterLibrary() is dedup-safe by name so nothing
      // gets duplicated on that retry.
      try {
      let usdaNeedsPrompt = false
      let usdaGrowth = false

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
          setMigrateProgress(undefined)
          await migrateStarterLibrary(update => setMigrateProgress({ step: update.step, current: update.current, total: update.total }))
          await updateRef.current({ starterLibraryVersion: CURRENT_STARTER_VERSION, starterLibrarySeeded: true })
          setPhase('migration-done')
        } else if (existing.length === 0) {
          await seedStarterLibrary()
          await updateRef.current({ starterLibraryVersion: CURRENT_STARTER_VERSION, starterLibrarySeeded: true })
        } else if (settings.starterLibrarySeeded) {
          // Already resolved the OLD (101-item) set, one way or another —
          // the set has since grown to 440, so offer the delta via a
          // distinctly-worded prompt rather than silently adding it or
          // silently leaving this household without it forever.
          usdaNeedsPrompt = true
          usdaGrowth = true
        } else {
          usdaNeedsPrompt = true
        }
      }

      // ── Branded branch — always an explicit choice, never silent. ──
      const brandedNeedsPrompt = !brandedResolved

      if (usdaNeedsPrompt || brandedNeedsPrompt) {
        setShowUsdaOption(usdaNeedsPrompt)
        setShowUsdaGrowthOffer(usdaGrowth)
        setShowBrandedOption(brandedNeedsPrompt)
        setUsdaChecked(true)
        setBrandedChecked(false)
        setPhase('prompt')
      }
      } catch (err) {
        setAutoSeedError(
          `Couldn't finish updating your starter ingredient library: ${err instanceof Error ? err.message : 'an unexpected error occurred'}. ` +
          `Nothing was lost — anything already loaded is safely saved, and you'll be offered this again next time you open the app.`
        )
        setPhase('auto-seed-error')
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

    setOpState('working')
    setOpProgress(undefined)
    setOpErrorMessage('')
    try {
      let usdaAdded = 0
      let brandedAdded = 0

      if (doUsda) {
        usdaAdded = await seedStarterLibrary(update => setOpProgress({ step: update.step, current: update.current, total: update.total }))
      }
      if (showUsdaOption) {
        await updateRef.current({ starterLibraryVersion: CURRENT_STARTER_VERSION, starterLibrarySeeded: true })
      }

      if (doBranded) {
        const result = await seedBrandedLibrary(update => setOpProgress({ step: update.step, current: update.current, total: update.total }))
        brandedAdded = result.added
      }
      if (showBrandedOption) {
        await updateRef.current({ brandedLibrarySeeded: true })
      }

      const parts: string[] = []
      if (doUsda) parts.push(`${usdaAdded} USDA ingredient${usdaAdded !== 1 ? 's' : ''}`)
      if (doBranded) parts.push(`${brandedAdded} branded product${brandedAdded !== 1 ? 's' : ''}`)
      setOpDoneMessage(parts.length > 0 ? `Added ${parts.join(' and ')}.` : 'Nothing new to add — you already have everything up to date.')
      setOpState('done')
    } catch (e) {
      // USDA (if any) already succeeded and its flag is already set above —
      // only the branded step can fail here (a fetch of the 867-item file).
      // Hide the (already-resolved) USDA option now, so a retry shows just
      // the branded pack — done here rather than right after the USDA save
      // above so the modal's content doesn't visibly shift mid-operation on
      // the (much more common) success path, where it's about to close anyway.
      if (showUsdaOption) setShowUsdaOption(false)
      setOpErrorMessage(e instanceof Error ? e.message : 'Could not load the branded pack. You can try again, or skip it for now.')
      setOpState('failed')
    }
  }

  async function handleSkip() {
    const flags: { starterLibraryVersion?: number; starterLibrarySeeded?: boolean; brandedLibrarySeeded?: boolean } = {}
    if (showUsdaOption) { flags.starterLibraryVersion = CURRENT_STARTER_VERSION; flags.starterLibrarySeeded = true }
    if (showBrandedOption) { flags.brandedLibrarySeeded = true }
    await updateRef.current(flags)
    setPhase('idle')
  }

  // Positioning only — OperationStatus supplies its own card styling
  // (background/border/shadow), so the fixed-position toasts below just
  // need to be placed on screen, not restyled.
  const toastWrapStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'var(--space-4)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 9999, width: 'calc(100vw - var(--space-6))', maxWidth: '420px',
  }

  const bothShown = showUsdaOption && showBrandedOption
  const selectedCount = (showUsdaOption && usdaChecked ? STARTER_INGREDIENT_COUNT : 0)
    + (showBrandedOption && brandedChecked ? BRANDED_LIBRARY_COUNT : 0)
  const loadLabel = opState === 'working'
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
          title={
            bothShown
              ? 'Starter Ingredient Libraries'
              : showUsdaOption
                ? (showUsdaGrowthOffer ? 'Starter Library Has Grown' : 'Starter Ingredient Library')
                : 'Branded Ingredient Pack'
          }
          size="sm"
          footer={
            opState === 'done' ? undefined : (
              <>
                <Button variant="secondary" onClick={handleSkip} disabled={opState === 'working'}>Skip</Button>
                <Button onClick={handleLoadSelected} disabled={opState === 'working'}>{loadLabel}</Button>
              </>
            )
          }
        >
          <div className={styles.body}>
            {!bothShown && showUsdaOption && showUsdaGrowthOffer && (
              <>
                <p className={styles.desc}>
                  Our starter ingredient library has grown from 101 to {STARTER_INGREDIENT_COUNT} common
                  ingredients with USDA nutritional data — want to add the newly added ones?
                </p>
                <div className={styles.categories}>
                  {USDA_CATEGORY_CHIPS.map(c => (
                    <span key={c} className={styles.chip}>{c}</span>
                  ))}
                </div>
                <p className={styles.note}>
                  Only ingredients not already in your database will be added — anything you already have,
                  including from the original 101, won't be duplicated. You can edit or delete any of them
                  after loading.
                </p>
              </>
            )}

            {!bothShown && showUsdaOption && !showUsdaGrowthOffer && (
              <>
                <p className={styles.desc}>
                  We have a pre-built library of {STARTER_INGREDIENT_COUNT} common ingredients with USDA nutritional
                  data — meats, produce, dairy, grains, seasonings, and more — ready to add to your database.
                </p>
                <div className={styles.categories}>
                  {USDA_CATEGORY_CHIPS.map(c => (
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
                    {showUsdaGrowthOffer ? (
                      <>
                        <strong>{STARTER_INGREDIENT_COUNT} USDA basics (grown from 101)</strong> — generic raw
                        ingredients with USDA nutritional data; only the newly added ones will actually be
                        inserted, anything you already have won't be duplicated.
                      </>
                    ) : (
                      <>
                        <strong>{STARTER_INGREDIENT_COUNT} USDA basics</strong> — generic raw ingredients
                        (meats, produce, dairy, grains, seasonings) with USDA nutritional data, no brand or price info.
                      </>
                    )}
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
              </>
            )}

            <OperationStatus
              state={opState}
              progress={opProgress}
              doneMessage={opDoneMessage || undefined}
              errorMessage={opErrorMessage || undefined}
              onDismiss={() => {
                // Done means the operation is genuinely finished — close the
                // modal (matching the pre-Phase-3 behavior of closing on
                // success), rather than reverting to the load prompt, which
                // is what happened here before this check existed: dismissing
                // (or the 5s auto-dismiss) just cleared opState back to
                // 'idle' while `phase` stayed 'prompt', so the Skip/Load
                // buttons silently reappeared as if nothing had happened.
                // Failed stays on 'idle' so the modal stays open for a retry.
                if (opState === 'done') setPhase('idle')
                setOpState('idle')
                setOpErrorMessage('')
              }}
            />
          </div>
        </Modal>
      )}
      {phase === 'migrating' && createPortal(
        <div style={toastWrapStyle}>
          <OperationStatus state="working" progress={migrateProgress ?? { step: 'Updating ingredient library' }} />
        </div>,
        document.body
      )}
      {phase === 'migration-done' && createPortal(
        <div style={toastWrapStyle}>
          <OperationStatus
            state="done"
            doneMessage="Starter ingredient library updated — related ingredients are now grouped together."
            onDismiss={() => setPhase('idle')}
          />
        </div>,
        document.body
      )}
      {phase === 'auto-seed-error' && createPortal(
        <div style={toastWrapStyle}>
          <OperationStatus
            state="failed"
            errorMessage={autoSeedError}
            onDismiss={() => { setPhase('idle'); setAutoSeedError('') }}
          />
        </div>,
        document.body
      )}
    </>
  )
}
