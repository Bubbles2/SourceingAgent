import { LoadingRegion } from '../../components/ui/LoadingRegion'
import './BidRequestForm.css'

export function BidRequestFormSkeleton(): React.JSX.Element {
  return (
    <LoadingRegion label="Loading the bid request form">
      <div className="bid-form-skeleton">
        <span className="skeleton skeleton--short" />
        <span className="skeleton" />
        <span className="skeleton skeleton--short" />
        <span className="skeleton" />
        <span className="skeleton skeleton--short" />
        <span className="skeleton" />
      </div>
    </LoadingRegion>
  )
}
