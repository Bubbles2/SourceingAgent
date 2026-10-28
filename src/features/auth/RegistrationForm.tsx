import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { ErrorSummary } from '../../components/form/ErrorSummary'
import { PasswordField } from '../../components/form/PasswordField'
import { SelectField, type SelectOption } from '../../components/form/SelectField'
import { TextField } from '../../components/form/TextField'
import { toSummaryErrors, useValidatedForm, type FormErrors } from '../../components/form/useValidatedForm'
import { Button } from '../../components/ui/Button'
import { formErrorsFromApi } from './apiFormErrors'
import { accountLimits, telephoneExample } from './authRules'
import { registerCustomer } from './authService'
import { emptyRegistrationValues, validateRegistration, type RegistrationFormValues } from './authValidation'
import { listCountries } from './countries'
import { welcomeState } from './welcomeState'
import type { RegistrationInput } from './types'

const fieldIds: Record<keyof RegistrationFormValues, string> = {
  firstName: 'register-first-name',
  lastName: 'register-last-name',
  email: 'register-email',
  password: 'register-password',
  confirmPassword: 'register-confirm-password',
  countryCode: 'register-country',
  companyName: 'register-company',
  telephone: 'register-telephone',
}

const registrationFields = Object.keys(fieldIds) as (keyof RegistrationFormValues)[]

const countryOptions: SelectOption[] = listCountries().map((country) => ({ value: country.code, label: country.name }))

export function RegistrationForm(): React.JSX.Element {
  const navigate = useNavigate()
  const form = useValidatedForm({
    initialValues: emptyRegistrationValues,
    validate: validateRegistration,
    onSubmit: handleRegister,
  })
  const { values, errors, setField } = form

  async function handleRegister(input: RegistrationInput): Promise<FormErrors<RegistrationFormValues> | null> {
    try {
      await registerCustomer(input)
    } catch (error) {
      return formErrorsFromApi<RegistrationFormValues>(error, registrationFields, { email_taken: 'email' })
    }
    navigate(paths.account, { replace: true, state: welcomeState })
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function fieldSetter(field: keyof RegistrationFormValues): (value: string) => void {
    return (value) => setField(field, value)
  }

  const summaryErrors = toSummaryErrors(errors, fieldIds)

  return (
    <div className="auth-card">
      <form className="auth-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
        {summaryErrors.length > 0 ? (
          <ErrorSummary key={form.failedSubmits} errors={summaryErrors} subject="creating your account" />
        ) : null}

        <fieldset className="form-section">
          <legend className="form-section__legend">Your name</legend>
          <div className="form-row">
            <TextField
              id={fieldIds.firstName}
              label="First name"
              required
              autoComplete="given-name"
              value={values.firstName}
              error={errors.firstName}
              onChange={fieldSetter('firstName')}
            />
            <TextField
              id={fieldIds.lastName}
              label="Last name"
              required
              autoComplete="family-name"
              value={values.lastName}
              error={errors.lastName}
              onChange={fieldSetter('lastName')}
            />
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section__legend">Sign-in details</legend>
          <TextField
            id={fieldIds.email}
            type="email"
            label="Email address"
            required
            autoComplete="email"
            value={values.email}
            hint="You'll sign in with this, and we'll email you as your requests progress."
            error={errors.email}
            onChange={fieldSetter('email')}
          />
          <PasswordField
            id={fieldIds.password}
            label="Password"
            required
            autoComplete="new-password"
            value={values.password}
            hint={`At least ${accountLimits.passwordMinLength} characters. A few unrelated words make a strong password that's easy to remember.`}
            error={errors.password}
            onChange={fieldSetter('password')}
          />
          <PasswordField
            id={fieldIds.confirmPassword}
            label="Confirm password"
            required
            autoComplete="new-password"
            value={values.confirmPassword}
            error={errors.confirmPassword}
            onChange={fieldSetter('confirmPassword')}
          />
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section__legend">Location and contact</legend>
          <SelectField
            id={fieldIds.countryCode}
            label="Country"
            required
            placeholder="Choose your country"
            autoComplete="country"
            value={values.countryCode}
            options={countryOptions}
            hint="Where you live, or where your business is based."
            error={errors.countryCode}
            onChange={fieldSetter('countryCode')}
          />
          <div className="form-row">
            <TextField
              id={fieldIds.companyName}
              label="Company name"
              autoComplete="organization"
              value={values.companyName}
              error={errors.companyName}
              onChange={fieldSetter('companyName')}
            />
            <TextField
              id={fieldIds.telephone}
              type="tel"
              label="Telephone number"
              autoComplete="tel"
              value={values.telephone}
              hint={`Include the country code, like ${telephoneExample}.`}
              error={errors.telephone}
              onChange={fieldSetter('telephone')}
            />
          </div>
        </fieldset>

        <div className="auth-form__actions">
          <Button type="submit" size="lg" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </div>
      </form>

      <p className="auth-card__footer">
        Already have an account? <Link to={paths.signIn}>Sign in</Link>
      </p>
    </div>
  )
}
