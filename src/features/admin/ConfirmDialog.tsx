import { useId, type ReactNode } from 'react'
import { Button, type ButtonVariant } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import './ConfirmDialog.css'

type ConfirmDialogProps = {
  title: string
  children: ReactNode
  confirmLabel: string
  confirmVariant?: ButtonVariant
  busy: boolean
  /** Why the last attempt failed, from the API */
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

/** Asks before a change that is hard to undo, such as cancelling a sale. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  confirmVariant = 'danger',
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps): React.JSX.Element {
  const titleId = useId()

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <div className="confirm-dialog">
        <h2 id={titleId} className="confirm-dialog__title">
          {title}
        </h2>
        <div className="confirm-dialog__body">{children}</div>
        {error ? (
          <p className="confirm-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog__actions">
          <Button variant={confirmVariant} disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving…' : confirmLabel}
          </Button>
          {/* A dialog-method form closes the native dialog without any script */}
          <form method="dialog">
            <Button type="submit" variant="secondary" disabled={busy}>
              Keep as it is
            </Button>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
