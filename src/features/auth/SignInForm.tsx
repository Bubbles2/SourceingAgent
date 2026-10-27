import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { ErrorSummary } from '../../components/form/ErrorSummary'
import { PasswordField } from '../../components/form/PasswordField'
import { TextField } from '../../components/form/TextField'
import { toSummaryErrors, useValidatedForm, type FormErrors } from '../../components/form/useValidatedForm'
import { Button } from '../../components/ui/Button'
import { signIn } from './authService'
import { validateSignIn, type SignInFormValues } from './authValidation'
import type { SignInInput } from './types'

const fieldIds: Record<keyof SignInFormValues, string> = {
  email: 'sign-in-email',
  password: 'sign-in-password',
}

type SignInFormProps = {
  /** Where to go once signed in */
  redirectTo: string
}

export function SignInForm({ redirectTo }: SignInFormProps): React.JSX.Element {
  const navigate = useNavigate()
  const form = useValidatedForm({
    initialValues: { email: '', password: '' },
    validate: validateSignIn,
    onSubmit: handleSignIn,
  })
  const { values, errors, setField } = form

  async function handleSignIn(input: SignInInput): Promise<FormErrors<SignInFormValues> | null> {
    const result = await signIn(input)
    if (!result.ok) {
      const serverErrors: FormErrors<SignInFormValues> = {}
      serverErrors.form = result.message
      return serverErrors
    }
    navigate(redirectTo, { replace: true })
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function handleEmailChange(value: string): void {
    setField('email', value)
  }

  function handlePasswordChange(value: string): void {
    setField('password', value)
  }

  const summaryErrors = toSummaryErrors(errors, fieldIds)

  return (
    <div className="auth-card">
      <form className="auth-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
        {summaryErrors.length > 0 ? (
          <ErrorSummary key={form.failedSubmits} errors={summaryErrors} subject="signing you in" />
        ) : null}

        <div className="auth-form__fields">
          <TextField
            id={fieldIds.email}
            type="email"
            label="Email address"
            required
            autoComplete="username"
            value={values.email}
            error={errors.email}
            onChange={handleEmailChange}
          />
          <PasswordField
            id={fieldIds.password}
            label="Password"
            required
            autoComplete="current-password"
            value={values.password}
            error={errors.password}
            onChange={handlePasswordChange}
          />
          <Link className="auth-form__link" to={paths.forgotPassword}>
            Forgot your password?
          </Link>
        </div>

        <div className="auth-form__actions">
          <Button type="submit" size="lg" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  )
}
