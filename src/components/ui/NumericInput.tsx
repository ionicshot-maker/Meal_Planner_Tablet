import { InputHTMLAttributes, useEffect, useRef, useState } from 'react'
import { parseFraction, formatNumeric } from '@/utils/fractionInput'
import styles from './Input.module.css'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string
  error?: string
  hint?: string
  value: number | string | undefined
  onChange: (value: number | undefined) => void
}

/**
 * Drop-in replacement for <Input type="number"> that also accepts common
 * fractions (1/4, 1 1/2, ½, ¾) and leading-decimal values (.25 → 0.25).
 * The displayed text is free-form while typing; on blur it is parsed and
 * the numeric value is committed via onChange.
 */
export function NumericInput({ label, error, hint, className = '', id, value, onChange, ...rest }: Props) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const focused = useRef(false)

  function toText(v: number | string | undefined): string {
    if (v === undefined || v === '') return ''
    const n = typeof v === 'string' ? parseFloat(v) : v
    return isNaN(n) ? '' : formatNumeric(n)
  }

  const [text, setText] = useState(() => toText(value))

  // Sync display when the value changes externally (not while the user is typing)
  useEffect(() => {
    if (!focused.current) {
      setText(toText(value))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value)
  }

  function handleFocus() {
    focused.current = true
  }

  function handleBlur() {
    focused.current = false
    const raw = text.trim()

    // Handle leading-decimal: ".5" → "0.5"
    const normalized = /^\.\d/.test(raw) ? '0' + raw : raw

    if (normalized === '') {
      onChange(undefined)
      setText('')
      return
    }

    const parsed = parseFraction(normalized)
    if (parsed !== null && isFinite(parsed)) {
      onChange(parsed)
      setText(formatNumeric(parsed))
    } else {
      // Invalid input — revert to the last valid value
      setText(toText(value))
    }
  }

  return (
    <div className={styles.wrapper}>
      {label && <label className={styles.label} htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        className={`${styles.input} ${error ? styles.hasError : ''} ${className}`}
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      />
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
