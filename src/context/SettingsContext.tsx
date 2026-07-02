import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/db/settings'
import type { AppSettings } from '@/types'

interface SettingsContextValue {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  reloadSettings: () => Promise<void>
  isLoading: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s)
      setIsLoading(false)
    })
  }, [])

  async function updateSettings(patch: Partial<AppSettings>) {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await saveSettings(updated)
  }

  // Re-reads settings from IndexedDB — used after a cloud sync writes settings
  // directly to the DB, bypassing this context's local state.
  async function reloadSettings() {
    const fresh = await loadSettings()
    setSettings(fresh)
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, reloadSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

export function useHouseholdTitle(page: string): string {
  const { settings } = useSettings()
  const name = settings.householdName.trim()
  return name ? `${name} ${page}` : page
}
