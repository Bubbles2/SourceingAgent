import { LoadingRegion } from '../../components/ui/LoadingRegion'
import './CatalogueCard.css'

function CatalogueCardSkeleton(): React.JSX.Element {
  return (
    <div className="catalogue-card">
      <div className="catalogue-card__cover">
        <span className="skeleton catalogue-card-skeleton__cover" />
      </div>
      <div className="catalogue-card__body">
        <span className="skeleton skeleton--short" />
        <span className="skeleton skeleton--title" />
        <span className="skeleton skeleton--medium" />
        <span className="skeleton" />
        <span className="skeleton skeleton--medium" />
      </div>
      <div className="catalogue-card__foot">
        <span className="skeleton skeleton--short" />
        <span className="skeleton skeleton--button" />
      </div>
    </div>
  )
}

type CatalogueGridSkeletonProps = {
  count: number
  label: string
}

export function CatalogueGridSkeleton({ count, label }: CatalogueGridSkeletonProps): React.JSX.Element {
  return (
    <LoadingRegion label={label}>
      <div className="catalogue-grid">
        {Array.from({ length: count }, (_, index) => (
          <CatalogueCardSkeleton key={index} />
        ))}
      </div>
    </LoadingRegion>
  )
}
