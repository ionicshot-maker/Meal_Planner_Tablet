import { useEffect, useState } from 'react'

/**
 * Tracks window.visualViewport's height in px, updating when the on-screen
 * keyboard opens/closes or a mobile browser's toolbar collapses/expands.
 * Unlike 100dvh (which only accounts for the toolbar), this also shrinks
 * when the keyboard is showing — needed for fixed/portaled panels whose
 * sticky footer would otherwise render underneath the keyboard.
 * Returns null when the API is unavailable (falls back to CSS dvh).
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(() =>
    typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : null
  )

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setHeight(vv.height)
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return height
}
