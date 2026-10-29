import { LoadingRegion } from '../../components/ui/LoadingRegion'
import './LotCard.css'

function LotCardSkeleton(): React.JSX.Element {
  return (
    <div className="lot-card">
      <span className="skeleton lot-card-skeleton__image" />
      <div className="lot-card__body">
        <span className="skeleton skeleton--short" />
        <span className="skeleton skeleton--title" />
        <span className="skeleton skeleton--medium" />
        <span className="skeleton" />
      </div>
      <div className="lot-card__foot">
        <span className="skeleton skeleton--short" />
        <span className="skeleton skeleton--button" />
      </div>
    </div>
  )
}

type LotGridSkeletonProps = {
  count: number
  label: string
}

export function LotGridSkeleton({ count, label }: LotGridSkeletonProps): React.JSX.Element {
  return (
    <LoadingRegion label={label}>
      <div className="lot-grid">
        {Array.from({ length: count }, (_, index) => (
          <LotCardSkeleton key={index} />
        ))}
      </div>
    </LoadingRegion>
  )
}
