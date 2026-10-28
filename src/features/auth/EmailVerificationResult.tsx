import { use, useId } from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import { paths } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { ApiError } from '../../services/apiClient'
import { focusOnMount } from '../../utils/dom'
import { confirmEmail } from './authService'
import { ResendVerification } from './ResendVerification'
import { useCurrentCustomer } from './useCurrentCustomer'

type Outcome = { ok: true } | { ok: false; message: string }

// One request per token, even when React renders twice in development: a token works only once.
const confirmations = new Map<string, Promise<Outcome>>()

function confirmOnce(token: string): Promise<Outcome> {
  let confirmation = confirmations.get(token)
  if (!confirmation) {
    confirmation = confirmEmail(token).then(
      (): Outcome => ({ ok: true }),
      (error: unknown): Outcome => ({
        ok: false,
        message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      }),
    )
    confirmations.set(token, confirmation)
  }
  return confirmation
}

export function EmailVerificationResult({ token }: { token: string }): React.JSX.Element {
  const outcome = use(confirmOnce(token))
  const customer = useCurrentCustomer()
  const titleId = useId()

  if (outcome.ok) {
    return (
      <section ref={focusOnMount} className="auth-card" tabIndex={-1} aria-labelledby={titleId}>
        <div className="auth-card__header">
          <CircleCheck size={28} className="auth-card__icon" />
          <h2 id={titleId} className="auth-card__title">
            Email address confirmed
          </h2>
        </div>
        <p className="auth-card__text">Thank you. Your account is ready for bid requests.</p>
        <div className="auth-card__actions">
          {customer ? (
            <ButtonLink to={paths.account}>Go to your account</ButtonLink>
          ) : (
            <ButtonLink to={paths.signIn}>Sign in</ButtonLink>
          )}
        </div>
      </section>
    )
  }

  return (
    <section ref={focusOnMount} className="auth-card" tabIndex={-1} aria-labelledby={titleId}>
      <div className="auth-card__header">
        <CircleX size={28} className="auth-card__icon auth-card__icon--error" />
        <h2 id={titleId} className="auth-card__title">
          We couldn't confirm your email address
        </h2>
      </div>
      <p className="auth-card__text">{outcome.message}</p>
      {customer && !customer.emailVerified ? <ResendVerification /> : null}
      {customer ? null : <p className="auth-card__text">Sign in, then ask for a new link from your account page.</p>}
      <div className="auth-card__actions">
        {customer ? (
          <ButtonLink to={paths.account} variant={customer.emailVerified ? 'primary' : 'secondary'}>
            Go to your account
          </ButtonLink>
        ) : (
          <ButtonLink to={paths.signIn}>Sign in</ButtonLink>
        )}
      </div>
    </section>
  )
}
