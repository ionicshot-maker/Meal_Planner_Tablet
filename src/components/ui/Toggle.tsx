import styles from './Toggle.module.css'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  id?: string
}

export function Toggle({ checked, onChange, label, disabled, id }: Props) {
  const toggleId = id ?? `toggle-${Math.random().toString(36).slice(2)}`
  return (
    <label className={`${styles.wrapper} ${disabled ? styles.disabled : ''}`} htmlFor={toggleId}>
      <input
        type="checkbox"
        role="switch"
        id={toggleId}
        className={styles.input}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  )
}
