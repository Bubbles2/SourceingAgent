import { LoadingRegion } from '../../components/ui/LoadingRegion'
import './AuctionCard.css'
import './AuctionDateStrip.css'

export function AuctionCardSkeleton(): React.JSX.Element {
  return (
    <div className="auction-card">
      <div className="date-strip">
        <span className="skeleton skeleton--on-navy auction-card-skeleton__day" />
      </div>
      <div className="auction-card__body">
        <span className="skeleton skeleton--title" />
        <span className="skeleton skeleton--medium" />
        <span className="skeleton skeleton--short" />
      </div>
      <div className="auction-card__foot">
        <span className="skeleton skeleton--short" />
        <span className="skeleton skeleton--button" />
      </div>
    </div>
  )
}

type AuctionGridSkeletonProps = {
  count: number
  label: string
}

export function AuctionGridSkeleton({ count, label }: AuctionGridSkeletonProps): React.JSX.Element {
  return (
    <LoadingRegion label={label}>
      <div className="auction-grid">
        {Array.from({ length: count }, (_, index) => (
          <AuctionCardSkeleton key={index} />
        ))}
      </div>
    </LoadingRegion>
  )
}
