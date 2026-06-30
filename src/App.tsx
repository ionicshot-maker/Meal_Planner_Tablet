import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SettingsProvider, useSettings } from '@/context/SettingsContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { SetupWizard } from '@/pages/Setup/SetupWizard'

const SettingsPage          = lazy(() => import('@/pages/Settings/SettingsPage'))
const IngredientsPage       = lazy(() => import('@/pages/Ingredients/IngredientsPage'))
const CookbookPage          = lazy(() => import('@/pages/Cookbook/CookbookPage'))
const MealPlannerPage       = lazy(() => import('@/pages/MealPlanner/MealPlannerPage'))
const MacroTrackerPage      = lazy(() => import('@/pages/MacroTracker/MacroTrackerPage'))
const GroceryListPage       = lazy(() => import('@/pages/GroceryList/GroceryListPage'))
const IngredientImportPage  = lazy(() => import('@/pages/IngredientImport/IngredientImportPage'))
const HelpPage              = lazy(() => import('@/pages/Help/HelpPage'))

function AppRoutes() {
  const { settings, updateSettings, isLoading } = useSettings()

  return (
    <ThemeProvider
      preference={settings.theme}
      onPreferenceChange={t => updateSettings({ theme: t })}
    >
      <BrowserRouter>
        {!isLoading && !settings.setupComplete && <SetupWizard />}
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/ingredients" replace />} />
              <Route path="/ingredients" element={<IngredientsPage />} />
              <Route path="/cookbook"    element={<CookbookPage />} />
              <Route path="/planner"     element={<MealPlannerPage />} />
              <Route path="/macros"      element={<MacroTrackerPage />} />
              <Route path="/grocery"            element={<GroceryListPage />} />
              <Route path="/settings"           element={<SettingsPage />} />
              <Route path="/import-ingredients" element={<IngredientImportPage />} />
              <Route path="/help"               element={<HelpPage />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </BrowserRouter>
    </ThemeProvider>
  )
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <AppRoutes />
    </SettingsProvider>
  )
}
