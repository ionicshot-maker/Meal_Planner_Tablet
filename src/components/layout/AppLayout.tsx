import { ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useSettings } from '@/context/SettingsContext'
import styles from './AppLayout.module.css'

const NAV_ITEMS = [
  { to: '/ingredients',        label: 'Ingredients',        icon: '🥕' },
  { to: '/import-ingredients', label: 'Import Ingredients', icon: '📥' },
  { to: '/cookbook',           label: 'Cookbook',           icon: '📖' },
  { to: '/planner',            label: 'Meal Plan',          icon: '📅' },
  { to: '/macros',             label: 'Macros',             icon: '📊' },
  { to: '/grocery',            label: 'Grocery',            icon: '🛒' },
  { to: '/settings',           label: 'Settings',           icon: '⚙️' },
  { to: '/help',               label: 'Help',               icon: '❓' },
]

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

export function AppLayout({ children }: { children: ReactNode }) {
  const { resolved, preference, setPreference } = useTheme()
  const { settings } = useSettings()
  const location = useLocation()
  const [helpOpen, setHelpOpen] = useState(false)

  const appTitle = settings.householdName.trim()
    ? `${settings.householdName.trim()} Meal Planner`
    : 'Meal Planner'

  const helpText = PAGE_HELP[location.pathname] ?? ''

  useEffect(() => {
    document.title = appTitle
  }, [appTitle])

  useEffect(() => {
    setHelpOpen(false)
  }, [location.pathname])

  function cycleTheme() {
    const order: typeof preference[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(preference) + 1) % order.length]
    setPreference(next)
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.navTop}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🍽️</span>
            <span className={styles.logoText}>{appTitle}</span>
          </div>
          <ul className={styles.navList} role="list">
            {NAV_ITEMS.map(item => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `${styles.navItem} ${isActive ? styles.active : ''}`
                  }
                >
                  <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
        {helpText && (
          <button
            className={`${styles.helpNavBtn} ${helpOpen ? styles.helpNavBtnActive : ''}`}
            onClick={() => setHelpOpen(v => !v)}
            aria-expanded={helpOpen}
            aria-label="What is this page?"
          >
            <span className={styles.navIcon} aria-hidden="true">❓</span>
            <span className={styles.navLabel}>Page Help</span>
          </button>
        )}
        <button className={styles.themeBtn} onClick={cycleTheme} aria-label="Toggle theme">
          <span aria-hidden="true">{resolved === 'dark' ? '☀️' : '🌙'}</span>
          <span className={styles.navLabel}>
            {preference === 'system' ? 'System' : preference === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>
      </nav>
      <main className={styles.main} id="main-content">
        {children}
      </main>

      {helpText && helpOpen && (
        <>
          <div className={styles.helpBackdrop} onClick={() => setHelpOpen(false)} aria-hidden="true" />
          <div className={styles.helpTooltip} role="dialog" aria-label="Page help">
            <p className={styles.helpTooltipText}>{helpText}</p>
            <button className={styles.helpTooltipClose} onClick={() => setHelpOpen(false)}>
              Got it ✓
            </button>
          </div>
        </>
      )}
    </div>
  )
}
