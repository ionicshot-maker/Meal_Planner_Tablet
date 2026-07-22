import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  // Called instead of onClose for a backdrop click or Escape — lets a modal
  // with unsaved input (via useConfirmClose) ask before discarding, while the
  // explicit X button below still always closes immediately. Defaults to
  // onClose, which reproduces the old always-close-on-backdrop behavior.
  onBackdropClose?: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onClose, onBackdropClose, title, children, footer, size = 'md' }: Props) {
  const closeOnBackdrop = onBackdropClose ?? onClose

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOnBackdrop() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, closeOnBackdrop])

  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onClick={closeOnBackdrop} aria-modal="true" role="dialog" aria-label={title}>
      <div
        className={`${styles.dialog} ${styles[size]}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
