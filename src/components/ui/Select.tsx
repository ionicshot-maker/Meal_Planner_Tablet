import { SelectHTMLAttributes, forwardRef } from 'react'
import styles from './Select.module.css'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, error, hint, options, className = '', id, ...rest }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className={styles.wrapper}>
        {label && <label className={styles.label} htmlFor={selectId}>{label}</label>}
        <select
          ref={ref}
          id={selectId}
          className={`${styles.select} ${error ? styles.hasError : ''} ${className}`}
          {...rest}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {hint && !error && <span className={styles.hint}>{hint}</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
    )
  }
)
Select.displayName = 'Select'
