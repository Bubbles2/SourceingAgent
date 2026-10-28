import { useId, useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { ErrorSummary } from '../../components/form/ErrorSummary'
import { PasswordField } from '../../components/form/PasswordField'
import { toSummaryErrors, useValidatedForm, type FormErrors } from '../../components/form/useValidatedForm'
import { Button, ButtonLink } from '../../components/ui/Button'
import { focusOnMount } from '../../utils/dom'
import { formErrorsFromApi } from './apiFormErrors'
import { accountLimits } from './authRules'
import { resetPassword } from './authService'
import { validateResetPassword, type ResetPasswordFormValues } from './authValidation'

const fieldIds: Record<keyof ResetPasswordFormValues, string> = {
  password: 'reset-password',
  confirmPassword: 'reset-confirm-password',
}

/** Sets a new password from an emailed link, then confirms it. */
export function ResetPasswordForm({ token }: { token: string }): React.JSX.Element {
  const [isChanged, setIsChanged] = useState(false)

  function handleChanged(): void {
    setIsChanged(true)
  }

  return isChanged ? <PasswordChanged /> : <NewPasswordForm token={token} onChanged={handleChanged} />
}

function NewPasswordForm({ token, onChanged }: { token: string; onChanged: () => void }): React.JSX.Element {
  const form = useValidatedForm({
    initialValues: { password: '', confirmPassword: '' },
    validate: validateResetPassword,
    onSubmit: handleReset,
  })

  async function handleReset(password: string): Promise<FormErrors<ResetPasswordFormValues> | null> {
    try {
      await resetPassword(token, password)
    } catch (error) {
      return formErrorsFromApi<ResetPasswordFormValues>(error, ['password'])
    }
    onChanged()
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function handlePasswordChange(value: string): void {
    form.setField('password', value)
  }

  function handleConfirmChange(value: string): void {
    form.setField('confirmPassword', value)
  }

  const summaryErrors = toSummaryErrors(form.errors, fieldIds)

  return (
    <div className="auth-card">
      <form className="auth-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
        {summaryErrors.length > 0 ? (
          <ErrorSummary key={form.failedSubmits} errors={summaryErrors} subject="changing your password" />
        ) : null}
        <div className="auth-form__fields">
          <PasswordField
            id={fieldIds.password}
            label="New password"
            required
            autoComplete="new-password"
            value={form.values.password}
            hint={`At least ${accountLimits.passwordMinLength} characters. A few unrelated words make a strong password that's easy to remember.`}
            error={form.errors.password}
            onChange={handlePasswordChange}
          />
          <PasswordField
            id={fieldIds.confirmPassword}
            label="Confirm new password"
            required
            autoComplete="new-password"
            value={form.values.confirmPassword}
            error={form.errors.confirmPassword}
            onChange={handleConfirmChange}
          />
        </div>
        <div className="auth-form__actions">
          <Button type="submit" size="lg" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Changing password…' : 'Change password'}
          </Button>
        </div>
      </form>
      <p className="auth-card__footer">
        Link not working? <Link to={paths.forgotPassword}>Request a new one</Link>
      </p>
    </div>
  )
}

function PasswordChanged(): React.JSX.Element {
  const titleId = useId()

  return (
    <section ref={focusOnMount} className="auth-card" tabIndex={-1} aria-labelledby={titleId}>
      <div className="auth-card__header">
        <CircleCheck size={28} className="auth-card__icon" />
        <h2 id={titleId} className="auth-card__title">
          Password changed
        </h2>
      </div>
      <p className="auth-card__text">
        Sign in with your new password. For your security, you have been signed out on every device.
      </p>
      <div className="auth-card__actions">
        <ButtonLink to={paths.signIn}>Sign in</ButtonLink>
      </div>
    </section>
  )
}
