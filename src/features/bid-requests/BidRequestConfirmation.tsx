import { useId } from 'react'
import { CircleCheck } from 'lucide-react'
import { paths } from '../../app/paths'
import { Button, ButtonLink } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/Badge'
import { focusOnMount } from '../../utils/dom'
import { formatEur } from '../../utils/money'
import { formatSaleMoment } from '../auctions/formatAuction'
import { lotName, lotTitle } from '../lots/lotText'
import type { MyBidRequest } from './types'
import './BidRequestForm.css'

type BidRequestConfirmationProps = {
  request: MyBidRequest
  onRequestAnother: () => void
}

/** Replaces the form after a successful submission and takes focus so the result is announced. */
export function BidRequestConfirmation({ request, onRequestAnother }: BidRequestConfirmationProps): React.JSX.Element {
  const titleId = useId()
  const { auction, lot } = request

  return (
    <section ref={focusOnMount} className="bid-confirmation" tabIndex={-1} aria-labelledby={titleId}>
      <div className="bid-confirmation__header">
        <CircleCheck size={28} className="bid-confirmation__icon" />
        <h2 id={titleId} className="bid-confirmation__title">
          Request submitted
        </h2>
      </div>
      <p className="bid-confirmation__lead">
        The agent will review your request and update its status under My requests.
      </p>

      <dl className="bid-confirmation__summary">
        <div>
          <dt>Auction</dt>
          <dd>
            {auction.title}
            <span className="bid-confirmation__sub">
              {[formatSaleMoment(auction), auction.location].filter(Boolean).join(' · ')}
            </span>
          </dd>
        </div>
        <div>
          <dt>Lot</dt>
          <dd>
            {lotName(lot.lotNumber)}
            <span className="bid-confirmation__sub">{lotTitle(lot)}</span>
          </dd>
        </div>
        <div>
          <dt>Maximum bid</dt>
          <dd>
            <span className="amount">{formatEur(request.maxBidEur)}</span>
            <span className="bid-confirmation__sub">Hammer price only</span>
          </dd>
        </div>
        {request.instructions ? (
          <div>
            <dt>Instructions</dt>
            <dd>{request.instructions}</dd>
          </div>
        ) : null}
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={request.status} />
          </dd>
        </div>
      </dl>

      <div className="bid-confirmation__actions">
        <ButtonLink to={paths.myRequests}>View my requests</ButtonLink>
        <Button variant="secondary" onClick={onRequestAnother}>
          Request another lot
        </Button>
      </div>
    </section>
  )
}
