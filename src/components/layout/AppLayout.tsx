import { ReactNode, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useSettings } from '@/context/SettingsContext'
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight'
import {
  Carrot, Download, BookOpen, Calendar, BarChart2, ShoppingCart,
  Settings, HelpCircle, UtensilsCrossed, Sun, Moon, Monitor,
} from 'lucide-react'
import styles from './AppLayout.module.css'

const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/ingredients',        label: 'Ingredients',        icon: <Carrot size={18} /> },
  { to: '/import-ingredients', label: 'Import Ingredients', icon: <Download size={18} /> },
  { to: '/cookbook',           label: 'Cookbook',           icon: <BookOpen size={18} /> },
  { to: '/planner',            label: 'Meal Plan',          icon: <Calendar size={18} /> },
  { to: '/macros',             label: 'Macros',             icon: <BarChart2 size={18} /> },
  { to: '/grocery',            label: 'Grocery',            icon: <ShoppingCart size={18} /> },
  { to: '/settings',           label: 'Settings',           icon: <Settings size={18} /> },
  { to: '/help',               label: 'Help',               icon: <HelpCircle size={18} /> },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { resolved, preference, setPreference } = useTheme()
  const { settings } = useSettings()
  // 100dvh (the CSS fallback) only accounts for the browser's own toolbar —
  // it doesn't shrink for the on-screen keyboard, which can otherwise cover
  // a page's sticky footer (e.g. the ingredient-import review screen) while
  // a field inside it has focus.
  const vvh = useVisualViewportHeight()

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

  const themeIcon = resolved === 'dark' ? <Sun size={18} /> : preference === 'system' ? <Monitor size={18} /> : <Moon size={18} />

  return (
    <div className={styles.shell} style={vvh ? { height: vvh } : undefined}>
      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.navTop}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}><UtensilsCrossed size={20} /></span>
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
          <span aria-hidden="true">{themeIcon}</span>
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
