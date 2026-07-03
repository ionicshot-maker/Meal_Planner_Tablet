import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import styles from './PageHelpButton.module.css'

const PAGE_HELP: Record<string, string> = {
  '/ingredients':        'This is your ingredient list. Everything you cook with lives here. Tap + Add Ingredient to add something new, or use Import Ingredients to scan a barcode.',
  '/import-ingredients': 'Use this page to add ingredients quickly. Scan a barcode with your camera, search the USDA database for fresh foods, or use Gemini AI to look up packaged products.',
  '/cookbook':           'This is where your recipes live. Tap + New Recipe to add a recipe, or tap Import to grab one from a website. Tap any recipe to view or edit it.',
  '/planner':            'This is your weekly meal calendar. Tap any meal slot to add a recipe to that day. A yellow dot means that day still has unfilled meal slots.',
  '/macros':             'This page shows your nutrition totals for today. Log meals, snacks, and drinks you actually ate. Scroll down to the Drinks section to log beverages. Compare against your personal nutrition goals.',
  '/grocery':            'Your shopping list page. Pick your shopping dates and the app builds your grocery list from your meal plan. Tap items to check them off as you shop.',
  '/settings':           'Customize the app here. Set up your household, add family members, connect free tools like USDA and Gemini, and set up Cloud Sync to keep devices in sync. Export your data for safekeeping.',
  '/help':               'You are on the Help page. Here you will find friendly guides for every feature, step-by-step instructions for optional free tools, and answers to common questions.',
}

/**
 * Compact "what is this page?" button meant to be dropped inline at the
 * end of a page's own header/toolbar row, after any other header buttons.
 * The popover is portaled and positioned from the button's own bounding
 * rect (not CSS position:relative) so it can never get clipped by a
 * page's overflow:hidden container or collide with other header buttons.
 */
export function PageHelpButton() {
  const location = useLocation()
  const helpText = PAGE_HELP[location.pathname] ?? ''
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
    }
    setOpen(v => !v)
  }

  if (!helpText) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.btn} ${open ? styles.btnActive : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label="Page Help"
        title="Page Help"
      >
        <Info size={16} aria-hidden="true" />
        <span className={styles.label}>Help</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className={styles.popover}
          style={{ top: pos.top, right: pos.right }}
          role="dialog"
          aria-label="Page help"
        >
          <p className={styles.popoverText}>{helpText}</p>
          <button type="button" className={styles.popoverClose} onClick={() => setOpen(false)}>
            Got it ✓
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
