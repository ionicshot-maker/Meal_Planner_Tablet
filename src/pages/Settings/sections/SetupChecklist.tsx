import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '@/context/SettingsContext'
import { getAllIngredients } from '@/db/ingredients'
import { getAllRecipes } from '@/db/recipes'
import { getDB } from '@/db/schema'
import styles from './SetupChecklist.module.css'

interface Props {
  onSwitchSection: (section: string) => void
}

interface Counts {
  hasIngredients: boolean
  hasRecipes: boolean
  hasMealPlan: boolean
}

export function SetupChecklist({ onSwitchSection }: Props) {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [counts, setCounts] = useState<Counts>({ hasIngredients: false, hasRecipes: false, hasMealPlan: false })
  const [loaded, setLoaded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    Promise.all([
      getAllIngredients().then(items => items.length > 0),
      getAllRecipes().then(items => items.length > 0),
      getDB().then(db => db.count('mealPlanDays')).then(n => n > 0),
    ]).then(([hasIngredients, hasRecipes, hasMealPlan]) => {
      setCounts({ hasIngredients, hasRecipes, hasMealPlan })
      setLoaded(true)
    })
  }, [])

  const hasHouseholdName = settings.householdName.trim().length > 0
  const hasPeople = settings.people.length > 0
  const hasUsdaKey = Boolean(settings.usdaApiKey)
  const hasGeminiKey = Boolean(settings.geminiApiKey)
  const hasCloudSync = Boolean(settings.supabaseUrl?.trim() && settings.householdSyncCode?.trim())

  const required = [hasHouseholdName, hasPeople, counts.hasIngredients, counts.hasRecipes, counts.hasMealPlan]
  const requiredDone = required.filter(Boolean).length
  const allRequiredDone = requiredDone === 5

  const optional = [hasUsdaKey, hasGeminiKey, hasCloudSync]
  const optionalDone = optional.filter(Boolean).length

  function progressMessage() {
    if (!loaded) return 'Loading your progress…'
    if (allRequiredDone && optionalDone === 3) return 'You are fully set up and ready to go!'
    if (allRequiredDone) return 'You are all set up! Optional extras available below.'
    if (requiredDone === 0) return 'Welcome! Tap any step below to get started.'
    if (requiredDone === 1) return 'Good start! Keep going — you are almost there.'
    if (requiredDone < 4) return `Great progress! You are ${requiredDone} out of 5 steps done.`
    return 'Almost there! Just one more step to complete setup.'
  }

  const items: { label: string; done: boolean; optional?: boolean; onClick: () => void }[] = [
    {
      label: 'Set your household name',
      done: hasHouseholdName,
      onClick: () => onSwitchSection('household'),
    },
    {
      label: 'Add at least one person profile',
      done: hasPeople,
      onClick: () => onSwitchSection('household'),
    },
    {
      label: 'Add your first ingredient',
      done: counts.hasIngredients,
      onClick: () => navigate('/ingredients'),
    },
    {
      label: 'Add your first recipe',
      done: counts.hasRecipes,
      onClick: () => navigate('/cookbook'),
    },
    {
      label: 'Plan your first meal',
      done: counts.hasMealPlan,
      onClick: () => navigate('/planner'),
    },
    {
      label: 'Add your free USDA code (optional)',
      done: hasUsdaKey,
      optional: true,
      onClick: () => onSwitchSection('integrations'),
    },
    {
      label: 'Add your free Gemini code (optional)',
      done: hasGeminiKey,
      optional: true,
      onClick: () => onSwitchSection('integrations'),
    },
    {
      label: 'Set up Cloud Sync — sync between devices (optional)',
      done: hasCloudSync,
      optional: true,
      onClick: () => onSwitchSection('data'),
    },
  ]

  return (
    <div className={`${styles.card} ${allRequiredDone ? styles.cardDone : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.cardLeft}>
          <span className={styles.cardIcon}>{allRequiredDone ? '🎉' : '📋'}</span>
          <div>
            <div className={styles.cardTitle}>Getting Set Up</div>
            <div className={styles.progressMsg}>{progressMessage()}</div>
          </div>
        </div>
        <button className={styles.collapseBtn} onClick={() => setCollapsed(v => !v)}>
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(requiredDone / 5) * 100}%` }}
            />
          </div>

          <ul className={styles.list}>
            {items.map((item, i) => (
              <li key={i}>
                <button
                  className={`${styles.item} ${item.done ? styles.itemDone : ''} ${item.optional ? styles.itemOptional : ''}`}
                  onClick={item.done ? undefined : item.onClick}
                  disabled={item.done}
                  aria-label={item.done ? `${item.label} — complete` : `Go to: ${item.label}`}
                >
                  <span className={styles.itemIcon} aria-hidden="true">
                    {item.done ? '✅' : '⬜'}
                  </span>
                  <span className={styles.itemLabel}>{item.label}</span>
                  {!item.done && <span className={styles.itemArrow} aria-hidden="true">→</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
