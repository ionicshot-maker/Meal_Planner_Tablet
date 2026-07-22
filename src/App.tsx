import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SettingsProvider, useSettings } from '@/context/SettingsContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { SetupWizard } from '@/pages/Setup/SetupWizard'
import { StarterLibraryPrompt } from '@/components/StarterLibraryPrompt'
import { CloudSyncPrompt } from '@/components/CloudSyncPrompt'
import { Toast } from '@/pages/IngredientImport/Toast'
import { isSupabaseConfigured, pingSupabaseKeepAlive } from '@/db/supabase'
import { repairLegacyIngredientData, repairSodiumUnitBug, fixMiscategorizedIngredients } from '@/db/ingredients'
import { migrateIngredientCategories } from '@/db/settings'

const SettingsPage          = lazy(() => import('@/pages/Settings/SettingsPage'))
const IngredientsPage       = lazy(() => import('@/pages/Ingredients/IngredientsPage'))
const CookbookPage          = lazy(() => import('@/pages/Cookbook/CookbookPage'))
const MealPlannerPage       = lazy(() => import('@/pages/MealPlanner/MealPlannerPage'))
const MacroTrackerPage      = lazy(() => import('@/pages/MacroTracker/MacroTrackerPage'))
const GroceryListPage       = lazy(() => import('@/pages/GroceryList/GroceryListPage'))
const IngredientImportPage  = lazy(() => import('@/pages/IngredientImport/IngredientImportPage'))
const HelpPage              = lazy(() => import('@/pages/Help/HelpPage'))

// Bump whenever fixMiscategorizedIngredients()'s rules change materially — forces
// one more pass even for households where settings.miscategoryFixed is already true
// from an earlier, less complete rule set. (Editing DEFAULT_SETTINGS alone doesn't
// do this: existing households already have a stored `miscategoryFixed` value, which
// always wins over the default in the settings merge.)
//
// v8: adopted the full CATEGORY_RULES.md shopper-intuition philosophy — jerky/Slim
// Jims/nuggets/chicken patties now auto-route to Snacks/Frozen instead of Meat &
// Poultry, raw frozen produce now auto-routes to Produce instead of staying in
// Frozen, and ~500 individually-reviewed ingredients from a real household backup
// were added to CATEGORY_NAME_OVERRIDES.
const CATEGORY_FIX_RULES_VERSION = 8

function AppRoutes() {
  const { settings, updateSettings, reloadSettings, isLoading } = useSettings()
  const [miscategoryToast, setMiscategoryToast] = useState<string | null>(null)

  // Text Size setting — device-local, applied as a CSS custom property on the
  // root element so every rem-based --text-* token scales proportionally.
  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${settings.fontSizePt ?? 14}pt`)
  }, [settings.fontSizePt])

  // Keep the free-tier Supabase project from pausing due to inactivity.
  useEffect(() => {
    if (!isLoading && isSupabaseConfigured(settings)) {
      void pingSupabaseKeepAlive(settings)
    }
  }, [isLoading, settings])

  // One-time repair for ingredients that landed in the database in a raw,
  // non-app shape (e.g. an Open Food Facts file imported via Settings → Data →
  // Import, which does no validation) — reshapes them so every screen that
  // reads variant.macros works again. Cheap no-op once the data is clean.
  useEffect(() => {
    if (isLoading) return
    repairLegacyIngredientData().then(count => {
      if (count > 0) console.log(`[data repair] Fixed ${count} ingredient(s) with legacy/raw data.`)
    })
  }, [isLoading])

  // One-time repair for a since-fixed unit-detection bug in the ingredient converter
  // script that multiplied some sodium readings by 1000 on the way in (see
  // repairSodiumUnitBug() in db/ingredients.ts for the exact detection rule). Cheap
  // no-op once the data is clean, same as the legacy-data repair above.
  useEffect(() => {
    if (isLoading) return
    repairSodiumUnitBug().then(count => {
      if (count > 0) console.log(`[sodium fix] Fixed ${count} ingredient(s) with a ×1000 sodium value.`)
    })
  }, [isLoading])

  // One-time migration from the old 15-category ingredient list to the expanded
  // 21-category list — remaps existing ingredients' category field and the
  // household's stored category list. Cheap no-op once already migrated.
  //
  // The miscategory fix below runs right after, in the same chain rather than its
  // own effect — both write to ingredient.category, so running them concurrently
  // could race and have one silently clobber the other's write for the same item.
  useEffect(() => {
    if (isLoading) return
    migrateIngredientCategories().then(async ({ categoriesUpdated, ingredientsRemapped }) => {
      if (categoriesUpdated || ingredientsRemapped > 0) {
        console.log(`[category migration] Updated category list: ${categoriesUpdated}, remapped ${ingredientsRemapped} ingredient(s).`)
      }
      // The migration writes settings straight to IndexedDB, bypassing this context's
      // local state — reload so the category list updates without a page refresh.
      if (categoriesUpdated) await reloadSettings()

      // One-time cleanup for ingredients that were bulk-imported with the wrong
      // category (most visibly, non-beverage items that landed in "Beverages", and
      // catch-all buckets like "Baking & Pantry" that still hold items from every
      // other category). Gated by settings.miscategoryFixed so it normally only runs
      // once per household — but re-armed whenever CATEGORY_FIX_RULES_VERSION is bumped,
      // since a completed pass under old rules doesn't cover new ones.
      const needsRun = !settings.miscategoryFixed || (settings.categoryFixRulesVersion ?? 0) < CATEGORY_FIX_RULES_VERSION
      if (needsRun) {
        const fixedCount = await fixMiscategorizedIngredients()
        await updateSettings({ miscategoryFixed: true, categoryFixRulesVersion: CATEGORY_FIX_RULES_VERSION })
        if (fixedCount > 0) {
          console.log(`[category fix] Fixed ${fixedCount} miscategorized ingredient(s).`)
          setMiscategoryToast(`Fixed ${fixedCount} ingredient categories`)
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  return (
    <ThemeProvider
      preference={settings.theme}
      onPreferenceChange={t => updateSettings({ theme: t })}
    >
      <BrowserRouter>
        {!isLoading && !settings.setupComplete && <SetupWizard />}
        {!isLoading && settings.setupComplete && <StarterLibraryPrompt />}
        {!isLoading && <CloudSyncPrompt />}
        {miscategoryToast && (
          <Toast message={miscategoryToast} onDone={() => setMiscategoryToast(null)} />
        )}
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
