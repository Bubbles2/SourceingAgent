import { useId } from 'react'
import { CalendarDays, Eye, Landmark, MapPin, X } from 'lucide-react'
import { auctionPath, requestBidPath } from '../../app/paths'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { AuctionDateStrip } from '../auctions/AuctionDateStrip'
import { formatSaleDateLong, formatViewingRange } from '../auctions/formatAuction'
import { getSaleStatus } from '../auctions/saleStatus'
import type { AuctionWithCatalogues } from '../auctions/types'
import { CatalogueLink } from '../catalogues/CatalogueLink'
import './AuctionDialog.css'

type AuctionDialogProps = {
  auction: AuctionWithCatalogues
  onClose: () => void
}

export function AuctionDialog({ auction, onClose }: AuctionDialogProps): React.JSX.Element {
  const titleId = useId()
  const isUpcoming = getSaleStatus(auction.saleDate) === 'upcoming'

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <AuctionDateStrip saleDate={auction.saleDate} category={auction.category} />

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
          <li>
            <Landmark size={16} />
            <span>
              <span className="visually-hidden">Auction house: </span>
              {auction.house}
            </span>
          </li>
          <li>
            <MapPin size={16} />
            <span>
              <span className="visually-hidden">Location: </span>
              {auction.city}
            </span>
          </li>
          <li>
            <CalendarDays size={16} />
            <span>
              <span className="visually-hidden">Date and time: </span>
              <time dateTime={`${auction.saleDate}T${auction.saleTime}`}>
                {`${formatSaleDateLong(auction.saleDate)} at ${auction.saleTime}`}
              </time>
              {' (Paris time)'}
            </span>
          </li>
          <li>
            <Eye size={16} />
            <span>{`Viewing ${formatViewingRange(auction.viewing)}`}</span>
          </li>
        </ul>

        <p className="auction-dialog__description">{auction.description}</p>
      </div>

      <div className="auction-dialog__foot">
        <CatalogueLink auction={auction} label="View catalogue" />
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
