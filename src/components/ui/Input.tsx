import { InputHTMLAttributes, forwardRef } from 'react'
import styles from './Input.module.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, hint, className = '', wrapperClassName = '', id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className={`${styles.wrapper} ${wrapperClassName}`}>
        {label && <label className={styles.label} htmlFor={inputId}>{label}</label>}
        <input
          ref={ref}
          id={inputId}
          className={`${styles.input} ${error ? styles.hasError : ''} ${className}`}
          {...rest}
        />
        {hint && !error && <span className={styles.hint}>{hint}</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
    )
  }
)
Input.displayName = 'Input'
