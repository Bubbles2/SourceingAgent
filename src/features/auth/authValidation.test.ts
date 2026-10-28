import { describe, expect, it } from 'vitest'
import {
  emptyRegistrationValues,
  validateForgotPassword,
  validateRegistration,
  validateResetPassword,
  validateSignIn,
  type RegistrationFormValues,
} from './authValidation'

const valid: RegistrationFormValues = {
  firstName: 'Camille',
  lastName: 'Durand',
  email: 'camille@example.com',
  password: 'correct horse battery',
  confirmPassword: 'correct horse battery',
  countryCode: 'FR',
  companyName: '',
  telephone: '',
}

describe('validateRegistration', () => {
  it('lists every missing required field and gives no input', () => {
    const { errors, input } = validateRegistration(emptyRegistrationValues)
    expect(input).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['confirmPassword', 'countryCode', 'email', 'firstName', 'lastName', 'password'])
    expect(errors.firstName).toBe('Enter your first name.')
  })

  it('tidies the details it sends', () => {
    const { errors, input } = validateRegistration({
      ...valid,
      firstName: '  Camille ',
      email: ' camille@example.com ',
      companyName: '   ',
      telephone: ' +33  1 23   45 67 89 ',
    })
    expect(errors).toEqual({})
    expect(input).toEqual({
      firstName: 'Camille',
      lastName: 'Durand',
      email: 'camille@example.com',
      password: 'correct horse battery',
      countryCode: 'FR',
      companyName: null,
      telephone: '+33 1 23 45 67 89',
    })
  })

  it('counts password length in characters, not UTF-16 units', () => {
    const elevenSymbols = '🔒'.repeat(11)
    expect(validateRegistration({ ...valid, password: elevenSymbols, confirmPassword: elevenSymbols }).errors.password).toBe(
      'Your password must be at least 12 characters.',
    )
    const twelveSymbols = '🔒'.repeat(12)
    expect(validateRegistration({ ...valid, password: twelveSymbols, confirmPassword: twelveSymbols }).errors).toEqual({})
  })

  it('needs matching passwords', () => {
    expect(validateRegistration({ ...valid, confirmPassword: 'something else' }).errors.confirmPassword).toMatch(/don't match/)
  })

  it.each([
    ['name@', 'Enter an email address in the correct format, like name@example.com.'],
    ['name@example', 'Enter an email address in the correct format, like name@example.com.'],
    [`${'a'.repeat(250)}@x.fr`, 'Email address must be 254 characters or fewer.'],
  ])('rejects the email %j', (email, message) => {
    expect(validateRegistration({ ...valid, email }).errors.email).toBe(message)
  })

  it('only accepts listed countries', () => {
    expect(validateRegistration({ ...valid, countryCode: 'XX' }).errors.countryCode).toBe('Choose a country from the list.')
  })

  it.each([
    ['+33 1 23 45 67 89', undefined],
    ['(020) 7946-0123', undefined],
    ['123456789012345', undefined],
    ['+33 1', 'Enter a telephone number with 6 to 15 digits, including the country code.'],
    ['1234567890123456', 'Enter a telephone number with 6 to 15 digits, including the country code.'],
    ['call me', expect.stringMatching(/^Enter a telephone number using digits/)],
  ])('checks the telephone number %j', (telephone, error) => {
    expect(validateRegistration({ ...valid, telephone }).errors.telephone).toEqual(error)
  })

  it('limits optional company names', () => {
    expect(validateRegistration({ ...valid, companyName: 'x'.repeat(201) }).errors.companyName).toBe(
      'Company name must be 200 characters or fewer.',
    )
  })
})

describe('validateSignIn', () => {
  it('needs an email and a password', () => {
    expect(validateSignIn({ email: '', password: '' }).errors).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    })
  })

  it('does not apply new-password rules to existing passwords', () => {
    expect(validateSignIn({ email: ' a@b.co ', password: 'short' })).toEqual({
      errors: {},
      input: { email: 'a@b.co', password: 'short' },
    })
  })
})

describe('validateForgotPassword', () => {
  it('trims a valid email', () => {
    expect(validateForgotPassword({ email: ' a@b.co ' })).toEqual({ errors: {}, input: 'a@b.co' })
  })

  it('rejects a malformed one', () => {
    expect(validateForgotPassword({ email: 'nope' }).input).toBeNull()
  })
})

describe('validateResetPassword', () => {
  it('applies the new-password rules and needs both entries to match', () => {
    expect(validateResetPassword({ password: 'short', confirmPassword: '' }).errors).toEqual({
      password: 'Your password must be at least 12 characters.',
      confirmPassword: 'Enter your new password again to confirm it.',
    })
    expect(validateResetPassword({ password: 'a long new passphrase', confirmPassword: 'a long new passphrase' })).toEqual({
      errors: {},
      input: 'a long new passphrase',
    })
  })
})
