import { useEffect, useState, type RefObject } from 'react'

interface Props {
  /** The scrollable element to watch — hint shows only while it actually overflows. */
  targetRef: RefObject<HTMLElement>
  /** Positioning/visual styles supplied by the host (differs per panel layout). */
  className: string
  label?: string
}

/**
 * Briefly nudges the user that a panel has more scrollable content above its
 * fixed footer — appears once, shortly after mount, only if the target
 * actually overflows and hasn't been scrolled yet, then fades on its own
 * (via the host's CSS animation) or immediately on the first scroll/touch.
 */
export function ScrollHint({ targetRef, className, label = 'Scroll for more' }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    const timer = window.setTimeout(() => {
      if (el.scrollHeight - el.clientHeight > 24 && el.scrollTop < 8) setShow(true)
    }, 500)
    function dismiss() { setShow(false) }
    el.addEventListener('scroll', dismiss, { passive: true })
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('scroll', dismiss)
    }
  }, [targetRef])

  if (!show) return null
  return (
    <div className={className} aria-hidden="true">
      {label} <span>↓</span>
    </div>
  )
}
