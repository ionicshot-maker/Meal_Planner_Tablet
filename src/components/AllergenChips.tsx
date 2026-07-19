import { ALLERGENS } from '@/types'
import styles from './AllergenChips.module.css'

// Read-only chips, e.g. on an ingredient card or a recipe's consolidated allergen list.
export function AllergenBadgeList({ allergens }: { allergens: string[] }) {
  if (allergens.length === 0) return null
  return (
    <span className={styles.wrap}>
      {allergens.map(a => (
        <span key={a} className={styles.chip}>{a}</span>
      ))}
    </span>
  )
}

// Click-to-toggle multi-select used in the ingredient editor.
export function AllergenPicker({ selected, onChange }: {
  selected: string[]
  onChange: (next: string[]) => void
}) {
  function toggle(allergen: string) {
    onChange(
      selected.includes(allergen)
        ? selected.filter(a => a !== allergen)
        : [...selected, allergen]
    )
  }

  return (
    <div className={styles.wrap}>
      {ALLERGENS.map(a => (
        <button
          key={a}
          type="button"
          className={`${styles.pickerChip} ${selected.includes(a) ? styles.pickerChipActive : ''}`}
          onClick={() => toggle(a)}
        >
          {a}
        </button>
      ))}
    </div>
  )
}
