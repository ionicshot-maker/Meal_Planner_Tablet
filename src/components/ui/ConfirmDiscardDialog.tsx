import { Modal } from './Modal'
import { Button } from './Button'

interface Props {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}

// Shown when a backdrop click or Escape hits a modal with unsaved input —
// pairs with useConfirmClose, which decides whether this needs to appear at all.
export function ConfirmDiscardDialog({ open, onKeepEditing, onDiscard }: Props) {
  if (!open) return null
  return (
    <Modal
      open
      onClose={onKeepEditing}
      title="Discard changes?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onKeepEditing}>Keep Editing</Button>
          <Button variant="danger" onClick={onDiscard}>Discard Changes</Button>
        </>
      }
    >
      <p>You have unsaved changes. Closing now will discard them.</p>
    </Modal>
  )
}
