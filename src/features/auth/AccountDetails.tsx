import { useId, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { Avatar } from '../../components/ui/Avatar'
import { Button, ButtonLink } from '../../components/ui/Button'
import { formatDayMonthYear } from '../auctions/formatAuction'
import { toParisDate } from '../auctions/saleStatus'
import { signOut } from './authService'
import { getCountryName } from './countries'
import type { CustomerAccount } from './types'
import './AccountDetails.css'

const roleLabels: Record<CustomerAccount['role'], string> = {
  customer: 'Customer',
  administrator: 'Administrator',
}

export function AccountDetails({ account }: { account: CustomerAccount }): React.JSX.Element {
  return (
    <div className="account">
      <AccountProfile account={account} />
      <BidRequestLinks />
    </div>
  )
}

function AccountProfile({ account }: { account: CustomerAccount }): React.JSX.Element {
  const titleId = useId()

  return (
    <section className="account-card account-profile" aria-labelledby={titleId}>
      <div className="account-profile__header">
        <Avatar firstName={account.firstName} lastName={account.lastName} size="lg" />
        <div className="account-profile__identity">
          <h2 id={titleId} className="account-profile__name">
            {`${account.firstName} ${account.lastName}`}
          </h2>
          <p className="account-profile__since">
            {roleLabels[account.role]} since{' '}
            <time dateTime={account.createdAt}>{formatDayMonthYear(toParisDate(account.createdAt))}</time>
          </p>
        </div>
      </div>

      <dl className="account-profile__details">
        <div>
          <dt>Email address</dt>
          <dd>
            {account.email}
            <span className="account-profile__status">{account.emailVerified ? 'Confirmed' : 'Not confirmed yet'}</span>
          </dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{getCountryName(account.countryCode)}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{account.companyName ?? <NotProvided />}</dd>
        </div>
        <div>
          <dt>Telephone</dt>
          <dd>{account.telephone ?? <NotProvided />}</dd>
        </div>
      </dl>

      <div className="account-profile__footer">
        <SignOutButton />
      </div>
    </section>
  )
}

function NotProvided(): React.JSX.Element {
  return <span className="account-profile__empty">Not provided</span>
}

function BidRequestLinks(): React.JSX.Element {
  const titleId = useId()

  return (
    <section className="account-card account-requests" aria-labelledby={titleId}>
      <h2 id={titleId} className="account-card__title">
        Bid requests
      </h2>
      <p className="account-card__text">
        Ask the agent to bid on a lot for you, then follow each request from review to result.
      </p>
      <div className="account-card__actions">
        <ButtonLink to={paths.requestBid}>Request a bid</ButtonLink>
        <ButtonLink to={paths.myRequests} variant="secondary">
          My requests
        </ButtonLink>
      </div>
    </section>
  )
}

function SignOutButton(): React.JSX.Element {
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)

  async function signOutAndLeave(): Promise<void> {
    setIsSigningOut(true)
    setHasFailed(false)
    try {
      await signOut()
      navigate(paths.home, { replace: true })
    } catch {
      setIsSigningOut(false)
      setHasFailed(true)
    }
  }

  function handleClick(): void {
    void signOutAndLeave()
  }

  return (
    <>
      <Button variant="secondary" disabled={isSigningOut} onClick={handleClick}>
        <LogOut size={18} />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </Button>
      {hasFailed ? (
        <p className="field__error" role="alert">
          We couldn't sign you out just now. Please try again.
        </p>
      ) : null}
    </>
  )
}
