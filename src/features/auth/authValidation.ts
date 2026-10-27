// Client-side validation for the account forms: instant, helpful feedback only.
// The mock auth service (authService) checks again on submission, as the API will.
import type { FormErrors, FormValidation } from '../../components/form/useValidatedForm'
import {
  checkCompanyName,
  checkCountry,
  checkEmail,
  checkName,
  checkNewPassword,
  checkTelephone,
  normalizeTelephone,
} from './authRules'
import type { RegistrationInput, SignInInput } from './types'

export type RegistrationFormValues = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
  countryCode: string
  companyName: string
  telephone: string
}

export const emptyRegistrationValues: RegistrationFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  countryCode: '',
  companyName: '',
  telephone: '',
}

export type SignInFormValues = {
  email: string
  password: string
}

export type ForgotPasswordFormValues = {
  email: string
}

function hasErrors<Values>(errors: FormErrors<Values>): boolean {
  return Object.values(errors).some(Boolean)
}

function addError<Values>(errors: FormErrors<Values>, field: keyof Values, message: string | null): void {
  if (message) {
    errors[field] = message
  }
}

export function validateRegistration(values: RegistrationFormValues): FormValidation<RegistrationFormValues, RegistrationInput> {
  const errors: FormErrors<RegistrationFormValues> = {}
  const firstName = values.firstName.trim()
  const lastName = values.lastName.trim()
  const email = values.email.trim()
  const companyName = values.companyName.trim()
  const telephone = normalizeTelephone(values.telephone)

  addError(errors, 'firstName', checkName(firstName, 'first name'))
  addError(errors, 'lastName', checkName(lastName, 'last name'))
  addError(errors, 'email', checkEmail(email))
  addError(errors, 'password', checkNewPassword(values.password))
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Enter your password again to confirm it.'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "The passwords don't match. Enter the same password in both fields."
  }
  addError(errors, 'countryCode', checkCountry(values.countryCode))
  addError(errors, 'companyName', checkCompanyName(companyName))
  addError(errors, 'telephone', checkTelephone(telephone))

  if (hasErrors(errors)) {
    return { errors, input: null }
  }
  return {
    errors: {},
    input: {
      firstName,
      lastName,
      email,
      password: values.password,
      countryCode: values.countryCode,
      companyName: companyName || null,
      telephone: telephone || null,
    },
  }
}

export function validateSignIn(values: SignInFormValues): FormValidation<SignInFormValues, SignInInput> {
  const errors: FormErrors<SignInFormValues> = {}
  const email = values.email.trim()

  addError(errors, 'email', checkEmail(email))
  // Only presence: rules for new passwords don't apply to existing ones.
  if (!values.password) {
    errors.password = 'Enter your password.'
  }

  if (hasErrors(errors)) {
    return { errors, input: null }
  }
  return { errors: {}, input: { email, password: values.password } }
}

export function validateForgotPassword(values: ForgotPasswordFormValues): FormValidation<ForgotPasswordFormValues, string> {
  const email = values.email.trim()
  const message = checkEmail(email)
  return message ? { errors: { email: message }, input: null } : { errors: {}, input: email }
}
