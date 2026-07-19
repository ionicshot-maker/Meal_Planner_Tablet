import { useState, useRef } from 'react'
import type { NutriscoreGrade, NovaGroupNum } from '@/types'
import {
  NUTRISCORE_COLORS, NUTRISCORE_TEXT_COLORS, NUTRISCORE_DESCRIPTIONS,
  NOVA_LABELS, NOVA_COLORS, NOVA_TEXT_COLORS, NOVA_DESCRIPTIONS,
} from '@/utils/ingredientQuality'
import styles from './QualityBadges.module.css'

// Small "(i)" icon — click to reveal a brief one-line tooltip. Click-toggled
// (not hover-only) so it works on touch/tablet, closes on blur or a second tap.
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleBlur() {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(o => !o)
  }

  return (
    <span className={styles.infoDotWrap}>
      <button
        type="button"
        className={styles.infoDot}
        onClick={handleClick}
        onBlur={handleBlur}
        aria-label="More info"
        aria-expanded={open}
      >
        i
      </button>
      {open && <span className={styles.infoTooltip} role="tooltip">{text}</span>}
    </span>
  )
}

export function NutriscoreBadge({ grade, size = 'sm', showInfo = false }: {
  grade?: NutriscoreGrade
  size?: 'sm' | 'md'
  showInfo?: boolean
}) {
  if (!grade) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        className={`${styles.badge} ${styles.nutriscoreBadge}`}
        style={{
          background: NUTRISCORE_COLORS[grade],
          color: NUTRISCORE_TEXT_COLORS[grade],
          width: size === 'md' ? 22 : 18,
          height: size === 'md' ? 22 : 18,
          fontSize: size === 'md' ? 'var(--text-sm)' : 'var(--text-xs)',
        }}
        title={`Nutriscore ${grade} — ${NUTRISCORE_DESCRIPTIONS[grade]}`}
      >
        {grade}
      </span>
      {showInfo && <InfoDot text={`Nutriscore ${grade} — ${NUTRISCORE_DESCRIPTIONS[grade]}`} />}
    </span>
  )
}

export function NovaBadge({ group, size = 'sm', showInfo = false }: {
  group?: NovaGroupNum
  size?: 'sm' | 'md'
  showInfo?: boolean
}) {
  if (!group) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        className={`${styles.badge} ${styles.novaBadge}`}
        style={{
          background: NOVA_COLORS[group],
          color: NOVA_TEXT_COLORS[group],
          fontSize: size === 'md' ? 'var(--text-sm)' : 'var(--text-xs)',
        }}
        title={`Nova ${group} — ${NOVA_DESCRIPTIONS[group]}`}
      >
        {NOVA_LABELS[group]}
      </span>
      {showInfo && <InfoDot text={`Nova ${group} — ${NOVA_DESCRIPTIONS[group]}`} />}
    </span>
  )
}
