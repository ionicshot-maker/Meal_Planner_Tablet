import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '@/context/SettingsContext'
import styles from './BrandCombobox.module.css'

interface Props {
  value: string
  onChange: (v: string) => void
  label?: string
}

export function BrandCombobox({ value, onChange, label = 'Brand Name' }: Props) {
  const { settings } = useSettings()
  const brands = settings.brands ?? []
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const showItems = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return brands.slice(0, 10)
    const matches = brands.filter(b => b.toLowerCase().includes(q))
    return (matches.length > 0 ? matches : brands).slice(0, 10)
  }, [value, brands])

  function openDropdown() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    setOpen(true)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label}>{label}</label>
      <input
        ref={inputRef}
        className={styles.input}
        value={value}
        onChange={e => { onChange(e.target.value); openDropdown() }}
        onFocus={openDropdown}
        placeholder="Generic"
      />
      {open && showItems.length > 0 && pos && createPortal(
        <div
          ref={dropdownRef}
          className={styles.dropdown}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {showItems.map(b => (
            <button
              key={b}
              className={`${styles.option} ${b.toLowerCase() === value.toLowerCase() ? styles.optionActive : ''}`}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(b); setOpen(false) }}
            >{b}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
