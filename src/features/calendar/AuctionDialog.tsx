import { useId } from 'react'
import { CalendarDays, Gavel, MapPin, X } from 'lucide-react'
import { auctionPath, requestBidPath } from '../../app/paths'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { AuctionDateStrip } from '../auctions/AuctionDateStrip'
import { formatLinkHost, formatLotCount, formatSaleMoment } from '../auctions/formatAuction'
import { getSaleStatus } from '../auctions/saleStatus'
import type { Auction } from '../auctions/types'
import './AuctionDialog.css'

type AuctionDialogProps = {
  auction: Auction
  onClose: () => void
}

export function AuctionDialog({ auction, onClose }: AuctionDialogProps): React.JSX.Element {
  const titleId = useId()
  const isUpcoming = getSaleStatus(auction.auctionDate) === 'upcoming'

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <AuctionDateStrip saleDate={auction.auctionDate} />

      <div className="auction-dialog__body">
        <div className="auction-dialog__heading">
          <h2 id={titleId} className="auction-dialog__title">
            {auction.title}
          </h2>
          {/* A dialog-method form closes the native dialog without any script */}
          <form method="dialog">
            <Button type="submit" variant="secondary" className="auction-dialog__close" aria-label="Close">
              <X size={20} />
            </Button>
          </form>
        </div>

        <ul className="auction-dialog__facts">
          {auction.location ? (
            <li>
              <MapPin size={16} />
              <span>
                <span className="visually-hidden">Location: </span>
                {auction.location}
              </span>
            </li>
          ) : null}
          <li>
            <CalendarDays size={16} />
            <span>
              <span className="visually-hidden">Date and time: </span>
              {auction.startsAt ? <time dateTime={auction.startsAt}>{formatSaleMoment(auction)}</time> : formatSaleMoment(auction)}
              {auction.startsAt ? ' (Paris time)' : null}
            </span>
          </li>
          {auction.lotCount > 0 ? (
            <li>
              <Gavel size={16} />
              <span>{formatLotCount(auction.lotCount)}</span>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="auction-dialog__foot">
        {auction.catalogueUrl ? (
          <OutboundLink
            href={auction.catalogueUrl}
            label={`Catalogue on ${formatLinkHost(auction.catalogueUrl)}`}
            context={auction.title}
          />
        ) : (
          <span />
        )}
        <div className="auction-dialog__actions">
          <ButtonLink to={auctionPath(auction.id)} variant="secondary">
            View details
          </ButtonLink>
          {isUpcoming ? (
            <ButtonLink to={requestBidPath(auction.id)}>Request a bid</ButtonLink>
          ) : (
            <span className="auction-dialog__ended">Sale ended</span>
          )}
        </div>
      </div>
    </Dialog>
  )
}
