import { useEffect, useState } from 'react'
import styles from './Toast.module.css'

interface ToastProps {
  message: string
  onDone: () => void
}

export function Toast({ message, onDone }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2500)
    const t2 = setTimeout(onDone, 3000)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [onDone])

  return (
    <div className={`${styles.toast} ${visible ? styles.in : styles.out}`} role="status">
      <span className={styles.icon}>✓</span>
      {message}
    </div>
  )
}
