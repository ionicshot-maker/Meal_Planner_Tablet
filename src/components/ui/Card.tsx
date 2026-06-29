import { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ children, padding = 'md', className = '', ...rest }: Props) {
  return (
    <div className={`${styles.card} ${styles[`p-${padding}`]} ${className}`} {...rest}>
      {children}
    </div>
  )
}
