import { Suspense, use, useId, useState } from 'react'
import { X } from 'lucide-react'
import { TextAreaField } from '../../components/form/TextAreaField'
import { StatusBadge, statusLabel } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Notice } from '../../components/ui/Notice'
import { formatEur } from '../../utils/money'
import { formatSaleMoment } from '../auctions/formatAuction'
import { lotName, lotTitle } from '../lots/lotText'
import { decisionButtons, formatChangeTime, isDecision, type Decision } from './reviewDecisions'
import { changeRequestStatus, type DetailResult } from './reviewService'
import type { ReviewBidRequest, StatusChange } from './types'
import './ReviewRequestDialog.css'

const noteMaxLength = 1000

type ReviewRequestDialogProps = {
  /** The row that was opened; titles the dialog while its details load */
  request: ReviewBidRequest
  detail: Promise<DetailResult>
  onClose: () => void
  /** The request moved on to a new status */
  onDecided: (request: ReviewBidRequest) => void
  /** Ask for the request's details again, e.g. after someone else changed it */
  onReload: () => void
}

/** One request in full: the customer, the amount, its history and the decisions open to the agent. */
export function ReviewRequestDialog({ request, detail, onClose, onDecided, onReload }: ReviewRequestDialogProps): React.JSX.Element {
  const titleId = useId()
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <div className="review-dialog__body">
        <div className="review-dialog__heading">
          <div>
            <p className="review-dialog__eyebrow">{lotName(request.lot.lotNumber)}</p>
            <h2 id={titleId} className="review-dialog__title">
              {request.auction.title}
            </h2>
          </div>
          {/* A dialog-method form closes the native dialog without any script */}
          <form method="dialog">
            <Button type="submit" variant="secondary" className="review-dialog__close" aria-label="Close">
              <X size={20} />
            </Button>
          </form>
        </div>

        {error ? (
          <p className="review-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <Suspense
          fallback={
            <p className="review-dialog__loading" role="status">
              Loading the request…
            </p>
          }
        >
          <ReviewDetails detail={detail} onDecided={onDecided} onReload={onReload} onError={setError} />
        </Suspense>
      </div>
    </Dialog>
  )
}

type ReviewDetailsProps = Pick<ReviewRequestDialogProps, 'detail' | 'onDecided' | 'onReload'> & {
  onError: (message: string | null) => void
}

function ReviewDetails({ detail: detailPromise, onDecided, onReload, onError }: ReviewDetailsProps): React.JSX.Element {
  const result = use(detailPromise)
  const historyId = useId()

  if (!result.ok) {
    return (
      <p className="review-dialog__error" role="alert">
        {result.message}
      </p>
    )
  }

  const { request, history } = result.detail
  const { customer, auction } = request

  return (
    <>
      <dl className="review-dialog__facts">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={request.status} />
          </dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>
            {`${customer.firstName} ${customer.lastName}`}
            <span className="review-dialog__secondary">
              {customer.companyName ? `${customer.email} · ${customer.companyName}` : customer.email}
            </span>
          </dd>
        </div>
        <div>
          <dt>Lot</dt>
          <dd>{lotTitle(request.lot)}</dd>
        </div>
        <div>
          <dt>Sale</dt>
          <dd>{[formatSaleMoment(auction), auction.location].filter(Boolean).join(' · ')}</dd>
        </div>
        <div>
          <dt>Maximum bid</dt>
          <dd className="review-dialog__amount">{formatEur(request.maxBidEur)}</dd>
        </div>
        {request.instructions ? (
          <div>
            <dt>Instructions</dt>
            <dd className="review-dialog__instructions">{request.instructions}</dd>
          </div>
        ) : null}
      </dl>

      {request.status === 'pending' && request.lotHeldByOther ? (
        <Notice tone="info" title="Lot already reserved.">
          Another accepted request holds this lot, so this one can't be accepted.
        </Notice>
      ) : null}

      <section className="review-dialog__history" aria-labelledby={historyId}>
        <h3 id={historyId} className="review-dialog__subheading">
          History
        </h3>
        <ol className="review-history">
          {history.map((change) => (
            <HistoryEntry key={`${change.changedAt}-${change.toStatus}`} change={change} />
          ))}
        </ol>
      </section>

      <DecisionForm request={request} onDecided={onDecided} onReload={onReload} onError={onError} />
    </>
  )
}

function HistoryEntry({ change }: { change: StatusChange }): React.JSX.Element {
  const step = change.fromStatus
    ? `${statusLabel(change.fromStatus)} → ${statusLabel(change.toStatus)}`
    : change.toStatus === 'pending'
      ? 'Submitted'
      : `Recorded as ${statusLabel(change.toStatus)}`
  const who = change.changedBy ? ` · ${change.changedBy.name}` : ''

  return (
    <li className="review-history__entry">
      <span className="review-history__step">{step}</span>
      <span className="review-history__meta">
        <time dateTime={change.changedAt}>{formatChangeTime(change.changedAt)}</time>
        {who}
      </span>
      {change.note ? <p className="review-history__note">{change.note}</p> : null}
    </li>
  )
}

type DecisionFormProps = Pick<ReviewDetailsProps, 'onDecided' | 'onReload' | 'onError'> & {
  request: ReviewBidRequest
}

// Refusals that mean the request or its lot changed since it was loaded; reloading shows why.
const outdatedCodes = new Set(['status_changed', 'lot_reserved', 'sale_closed', 'invalid_status_change', 'sale_not_started'])

function DecisionForm({ request, onDecided, onReload, onError }: DecisionFormProps): React.JSX.Element {
  const noteId = useId()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState<Decision | null>(null)
  const decisions = request.nextStatuses.filter(isDecision)

  if (decisions.length === 0) {
    return (
      <p className="review-dialog__final">
        {request.status === 'placed'
          ? 'The result can be recorded once the sale has started.'
          : `“${statusLabel(request.status)}” is final, so this request won't change again.`}
      </p>
    )
  }

  async function decide(to: Decision): Promise<void> {
    setSaving(to)
    onError(null)
    const result = await changeRequestStatus(request.id, { from: request.status, to, note: note.trim() })
    setSaving(null)
    if (result.ok) {
      onDecided(result.request)
      return
    }
    onError(result.message)
    if (outdatedCodes.has(result.code)) {
      onReload()
    }
  }

  return (
    <div className="review-dialog__decision">
      <TextAreaField
        id={noteId}
        label="Note"
        hint="Kept in the request's history. Customers don't see it."
        value={note}
        maxLength={noteMaxLength}
        onChange={setNote}
      />
      <div className="review-dialog__actions">
        {decisions.map((decision) => (
          <Button
            key={decision}
            variant={decisionButtons[decision].variant}
            disabled={saving !== null || note.length > noteMaxLength}
            onClick={() => void decide(decision)}
          >
            {saving === decision ? 'Saving…' : decisionButtons[decision].label}
          </Button>
        ))}
      </div>
    </div>
  )
}
