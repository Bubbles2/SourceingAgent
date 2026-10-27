import { LoadingRegion } from '../../components/ui/LoadingRegion'
import './AccountDetails.css'

export function AccountSkeleton(): React.JSX.Element {
  return (
    <LoadingRegion label="Loading your account">
      <div className="account">
        <div className="account-card account-profile">
          <div className="account-profile__header">
            <span className="skeleton account-skeleton__avatar" />
            <div className="account-profile__identity account-skeleton__identity">
              <span className="skeleton skeleton--title" />
              <span className="skeleton skeleton--short" />
            </div>
          </div>
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="skeleton skeleton--medium" />
          ))}
        </div>
        <div className="account-card account-requests">
          <span className="skeleton skeleton--title" />
          <span className="skeleton" />
          <span className="skeleton skeleton--button" />
        </div>
      </div>
    </LoadingRegion>
  )
}
