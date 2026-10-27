import type { MouseEvent, ReactNode } from 'react'
import './Dialog.css'

type DialogProps = {
  /** Id of the heading that names the dialog */
  labelledBy: string
  /** Called after the dialog has closed (Escape, backdrop click or a `<form method="dialog">` button) */
  onClose: () => void
  children: ReactNode
}

// Opening with showModal() gives the native focus trap, Escape handling, inert background
// and focus return to the triggering element on close.
function openAsModal(dialog: HTMLDialogElement | null): void {
  if (dialog && !dialog.open) {
    dialog.showModal()
  }
}

function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
  // The panel fills the dialog box, so a click on the dialog element itself landed on the backdrop.
  if (event.target === event.currentTarget) {
    event.currentTarget.close()
  }
}

/** Modal dialog, open while mounted. Render it conditionally and unmount it from `onClose`. */
export function Dialog({ labelledBy, onClose, children }: DialogProps): React.JSX.Element {
  return (
    <dialog ref={openAsModal} className="dialog" aria-labelledby={labelledBy} onClose={onClose} onClick={handleBackdropClick}>
      <div className="dialog__panel">{children}</div>
    </dialog>
  )
}
