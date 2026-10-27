import { paths } from '../../app/paths'
import { ButtonLink } from '../ui/Button'
import './AccountActions.css'

type AccountActionsProps = {
  className?: string
  onNavigate?: () => void
}

/** Signed-out header actions. The signed-in avatar menu replaces these once authentication exists. */
export function AccountActions({ className, onNavigate }: AccountActionsProps): React.JSX.Element {
  return (
    <div className={className ? `account-actions ${className}` : 'account-actions'}>
      <ButtonLink to={paths.signIn} variant="secondary" onClick={onNavigate}>
        Sign in
      </ButtonLink>
      <ButtonLink to={paths.register} onClick={onNavigate}>
        Create account
      </ButtonLink>
    </div>
  )
}
