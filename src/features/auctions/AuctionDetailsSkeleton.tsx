import { LoadingRegion } from '../../components/ui/LoadingRegion'
import './AuctionDetails.css'

export function AuctionDetailsSkeleton(): React.JSX.Element {
  return (
    <div className="section page">
      <div className="container">
        <LoadingRegion label="Loading auction">
          <div className="auction-details-skeleton">
            <div className="auction-details-skeleton__header">
              <span className="skeleton skeleton--short" />
              <span className="skeleton auction-details-skeleton__heading" />
              <span className="skeleton skeleton--medium" />
            </div>
            <div className="auction-details">
              <div className="auction-details__aside">
                <span className="skeleton auction-details-skeleton__panel" />
              </div>
              <div className="auction-details__main">
                <div className="auction-details__section">
                  <span className="skeleton skeleton--title" />
                  <span className="skeleton" />
                  <span className="skeleton skeleton--medium" />
                </div>
              </div>
            </div>
          </div>
        </LoadingRegion>
      </div>
    </div>
  )
}
