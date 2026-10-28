import { useState } from 'react'
import { useNavigate } from 'react-router'
import { adminAuctionPath, paths } from '../../app/paths'
import { Button } from '../../components/ui/Button'
import { ApiError } from '../../services/apiClient'
import type { AuctionStatus, AuctionWithCatalogues } from '../auctions/types'
import { changeAuctionStatus, deleteAuction } from './adminAuctionService'
import { ConfirmDialog } from './ConfirmDialog'
import { flashState } from './flash'

type Confirming = 'cancel' | 'delete' | null

const unexpectedMessage = "We couldn't save this just now. Check your connection, then try again."

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : unexpectedMessage
}

/**
 * Publish, cancel, publish again or delete a sale. Drafts and cancelled sales without catalogues can
 * be deleted; once catalogues exist, a sale is cancelled instead so its history stays.
 */
export function AuctionStatusActions({ auction }: { auction: AuctionWithCatalogues }): React.JSX.Element {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canDelete = auction.status !== 'published' && auction.catalogues.length === 0

  async function changeStatus(status: AuctionStatus, message: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await changeAuctionStatus(auction.id, status)
      // Reloads the page's data, with the confirmation
      navigate(adminAuctionPath(auction.id), { replace: true, state: flashState(message) })
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await deleteAuction(auction.id)
      navigate(`${paths.adminAuctions}?view=${auction.status === 'draft' ? 'drafts' : 'cancelled'}`, {
        replace: true,
        state: flashState(`“${auction.title}” was deleted.`),
      })
    } catch (failure) {
      setError(messageOf(failure))
      setBusy(false)
    }
  }

  function handleClose(): void {
    setConfirming(null)
    setError(null)
  }

  return (
    <>
      {auction.status !== 'published' ? (
        <Button disabled={busy} onClick={() => void changeStatus('published', 'The sale is published and on the website.')}>
          {auction.status === 'draft' ? 'Publish' : 'Publish again'}
        </Button>
      ) : null}
      {auction.status !== 'cancelled' && !canDelete ? (
        <Button variant="secondary" disabled={busy} onClick={() => setConfirming('cancel')}>
          Cancel sale
        </Button>
      ) : null}
      {canDelete ? (
        <Button variant="secondary" disabled={busy} onClick={() => setConfirming('delete')}>
          Delete
        </Button>
      ) : null}
      {error && confirming === null ? (
        <p className="admin-detail__error" role="alert">
          {error}
        </p>
      ) : null}

      {confirming === 'cancel' ? (
        <ConfirmDialog
          title="Cancel this sale?"
          confirmLabel="Cancel sale"
          busy={busy}
          error={error}
          onConfirm={() => void changeStatus('cancelled', 'The sale is cancelled and no longer on the website.')}
          onClose={handleClose}
        >
          <p>It disappears from the website, and no new bid requests can be made for it.</p>
          <p>Requests customers have already made keep their status: reject or cancel them under Bid requests.</p>
        </ConfirmDialog>
      ) : null}
      {confirming === 'delete' ? (
        <ConfirmDialog
          title="Delete this sale?"
          confirmLabel="Delete sale"
          busy={busy}
          error={error}
          onConfirm={() => void handleDelete()}
          onClose={handleClose}
        >
          <p>{`“${auction.title}” will be removed for good. This can't be undone.`}</p>
        </ConfirmDialog>
      ) : null}
    </>
  )
}
