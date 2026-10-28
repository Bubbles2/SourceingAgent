import { NavLink } from 'react-router'
import { paths } from '../../app/paths'
import { useCurrentCustomer } from '../../features/auth/useCurrentCustomer'
import { Avatar } from '../ui/Avatar'
import { ButtonLink } from '../ui/Button'
import './AccountActions.css'

type AccountActionsProps = {
  className?: string
  onNavigate?: () => void
}

/**
 * Header actions: Sign in + Create account, or My requests (Administration for administrators) and
 * the account link once signed in (DESIGN.md §6.1).
 */
export function AccountActions({ className, onNavigate }: AccountActionsProps): React.JSX.Element {
  const customer = useCurrentCustomer()
  const actionsClassName = className ? `account-actions ${className}` : 'account-actions'

  if (customer) {
    return (
      <div className={actionsClassName}>
        {customer.role === 'administrator' ? (
          <ButtonLink to={paths.admin} variant="secondary" onClick={onNavigate}>
            Administration
          </ButtonLink>
        ) : (
          <ButtonLink to={paths.myRequests} variant="secondary" onClick={onNavigate}>
            My requests
          </ButtonLink>
        )}
        <NavLink to={paths.account} className="account-link" onClick={onNavigate}>
          <Avatar firstName={customer.firstName} lastName={customer.lastName} />
          <span className="account-link__name">{customer.firstName}</span>
          <span className="visually-hidden">, your account</span>
        </NavLink>
      </div>
    )
  }

  return (
    <div className={actionsClassName}>
      <ButtonLink to={paths.signIn} variant="secondary" onClick={onNavigate}>
        Sign in
      </ButtonLink>
      <ButtonLink to={paths.register} onClick={onNavigate}>
        Create account
      </ButtonLink>
    </div>
  )
}
