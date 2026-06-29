import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { ThemePreference } from '@/types'

type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const SYSTEM_DARK = window.matchMedia('(prefers-color-scheme: dark)')

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') return SYSTEM_DARK.matches ? 'dark' : 'light'
  return pref
}

export function ThemeProvider({ preference, onPreferenceChange, children }: {
  preference: ThemePreference
  onPreferenceChange: (pref: ThemePreference) => void
  children: ReactNode
}) {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference))

  useEffect(() => {
    setResolved(resolveTheme(preference))
  }, [preference])

  useEffect(() => {
    const handler = () => {
      if (preference === 'system') setResolved(SYSTEM_DARK.matches ? 'dark' : 'light')
    }
    SYSTEM_DARK.addEventListener('change', handler)
    return () => SYSTEM_DARK.removeEventListener('change', handler)
  }, [preference])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
  }, [resolved])

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference: onPreferenceChange }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
