import { useId, useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { ErrorSummary } from '../../components/form/ErrorSummary'
import { TextField } from '../../components/form/TextField'
import { toSummaryErrors, useValidatedForm } from '../../components/form/useValidatedForm'
import { Button, ButtonLink } from '../../components/ui/Button'
import { focusOnMount } from '../../utils/dom'
import { requestPasswordReset } from './authService'
import { validateForgotPassword, type ForgotPasswordFormValues } from './authValidation'

const fieldIds: Record<keyof ForgotPasswordFormValues, string> = {
  email: 'forgot-password-email',
}

/** Asks for the email, then confirms without saying whether an account exists. */
export function ForgotPasswordForm(): React.JSX.Element {
  const [sentTo, setSentTo] = useState<string | null>(null)

  function handleUseAnotherEmail(): void {
    setSentTo(null)
  }

  if (sentTo) {
    return <ResetLinkSent email={sentTo} onUseAnotherEmail={handleUseAnotherEmail} />
  }
  return <ResetRequestForm onSent={setSentTo} />
}

function ResetRequestForm({ onSent }: { onSent: (email: string) => void }): React.JSX.Element {
  const form = useValidatedForm({
    initialValues: { email: '' },
    validate: validateForgotPassword,
    onSubmit: handleRequestReset,
  })

  async function handleRequestReset(email: string): Promise<null> {
    await requestPasswordReset(email)
    onSent(email)
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function handleEmailChange(value: string): void {
    form.setField('email', value)
  }

  const summaryErrors = toSummaryErrors(form.errors, fieldIds)

  return (
    <div className="auth-card">
      <form className="auth-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
        {summaryErrors.length > 0 ? (
          <ErrorSummary key={form.failedSubmits} errors={summaryErrors} subject="sending the reset link" />
        ) : null}
        <TextField
          id={fieldIds.email}
          type="email"
          label="Email address"
          required
          autoComplete="email"
          value={form.values.email}
          hint="The address you registered with."
          error={form.errors.email}
          onChange={handleEmailChange}
        />
        <div className="auth-form__actions">
          <Button type="submit" size="lg" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Sending link…' : 'Send reset link'}
          </Button>
        </div>
      </form>
      <p className="auth-card__footer">
        Remembered it? <Link to={paths.signIn}>Sign in</Link>
      </p>
    </div>
  )
}

type ResetLinkSentProps = {
  email: string
  onUseAnotherEmail: () => void
}

function ResetLinkSent({ email, onUseAnotherEmail }: ResetLinkSentProps): React.JSX.Element {
  const titleId = useId()

  return (
    <section ref={focusOnMount} className="auth-card" tabIndex={-1} aria-labelledby={titleId}>
      <div className="auth-card__header">
        <MailCheck size={28} className="auth-card__icon" />
        <h2 id={titleId} className="auth-card__title">
          Check your email
        </h2>
      </div>
      <p className="auth-card__text">
        If an account exists for <strong>{email}</strong>, we will send it a link to choose a new password.
      </p>
      <div className="auth-card__actions">
        <ButtonLink to={paths.signIn}>Back to sign in</ButtonLink>
        <Button variant="secondary" onClick={onUseAnotherEmail}>
          Use a different email address
        </Button>
      </div>
    </section>
  )
}
