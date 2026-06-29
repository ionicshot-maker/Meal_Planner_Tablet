import { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
