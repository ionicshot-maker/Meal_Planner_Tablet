import { useState } from 'react'

// Shared gate for "click outside / Escape" on modals that hold editable,
// unsaved input. Explicit X/Cancel buttons should keep calling onClose
// directly (that's already a deliberate act) — only wire requestClose into
// the backdrop click and Escape handler so an accidental dismiss asks first
// instead of silently discarding whatever was typed.
export function useConfirmClose(isDirty: boolean, onClose: () => void) {
  const [confirming, setConfirming] = useState(false)

  function requestClose() {
    if (isDirty) {
      setConfirming(true)
    } else {
      onClose()
    }
  }

  function confirmDiscard() {
    setConfirming(false)
    onClose()
  }

  function cancelDiscard() {
    setConfirming(false)
  }

  return { confirming, requestClose, confirmDiscard, cancelDiscard }
}
