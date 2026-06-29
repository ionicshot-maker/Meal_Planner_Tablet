import { ReactNode, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useSettings } from '@/context/SettingsContext'
import styles from './AppLayout.module.css'

const NAV_ITEMS = [
  { to: '/ingredients', label: 'Ingredients', icon: '🥕' },
  { to: '/cookbook',    label: 'Cookbook',    icon: '📖' },
  { to: '/planner',     label: 'Meal Plan',   icon: '📅' },
  { to: '/macros',      label: 'Macros',      icon: '📊' },
  { to: '/grocery',     label: 'Grocery',     icon: '🛒' },
  { to: '/settings',    label: 'Settings',    icon: '⚙️' },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { resolved, preference, setPreference } = useTheme()
  const { settings } = useSettings()
  const appTitle = settings.householdName.trim()
    ? `${settings.householdName.trim()} Meal Planner`
    : 'Meal Planner'

  useEffect(() => {
    document.title = appTitle
  }, [appTitle])

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
    </div>
  )
}
