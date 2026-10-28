import { describe, expect, it } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { parseAccountResponse } from './accountResponse'
import { formErrorsFromApi } from './apiFormErrors'

type Values = { email: string; password: string }

describe('formErrorsFromApi', () => {
  it('puts a code that belongs to one field on that field', () => {
    const error = new ApiError(409, 'email_taken', 'An account already exists for this email address.')
    expect(formErrorsFromApi<Values>(error, ['email', 'password'], { email_taken: 'email' })).toEqual({
      email: 'An account already exists for this email address.',
    })
  })

  it('puts validation details on their fields, keeping the first message per field', () => {
    const error = new ApiError(400, 'validation_failed', 'Invalid', [
      { path: 'body.password', message: 'Your password must be at least 12 characters.' },
      { path: 'body.password', message: 'second message' },
      { path: 'body.unknown', message: 'ignored' },
    ])
    expect(formErrorsFromApi<Values>(error, ['email', 'password'])).toEqual({
      password: 'Your password must be at least 12 characters.',
    })
  })

  it('puts anything else at the top of the form', () => {
    const error = new ApiError(429, 'rate_limited', 'Too many attempts. Please wait 15 minutes and try again.')
    expect(formErrorsFromApi<Values>(error, ['email', 'password'])).toEqual({
      form: 'Too many attempts. Please wait 15 minutes and try again.',
    })
  })

  it('rethrows errors that are not from the API', () => {
    expect(() => formErrorsFromApi<Values>(new Error('bug'), ['email'])).toThrow('bug')
  })

  it('maps nested API paths to the form fields that hold them', () => {
    type SaleValues = { viewingStart: string; viewingEnd: string }
    const error = new ApiError(400, 'validation_failed', 'Invalid', [
      { path: 'body.viewing.end', message: 'Viewing must end on or before the sale date.' },
    ])
    expect(formErrorsFromApi<SaleValues>(error, ['viewingStart', 'viewingEnd'], {}, { 'body.viewing.end': 'viewingEnd' })).toEqual({
      viewingEnd: 'Viewing must end on or before the sale date.',
    })
  })
})

describe('parseAccountResponse', () => {
  const user = {
    id: 'u1',
    firstName: 'Camille',
    lastName: 'Durand',
    email: 'camille@example.com',
    countryCode: 'FR',
    companyName: null,
    telephone: null,
    role: 'customer',
    emailVerified: false,
    createdAt: '2026-10-28T09:00:00.000Z',
  }

  it('reads the account, leaving out anything unexpected', () => {
    expect(parseAccountResponse({ user: { ...user, passwordHash: 'never' } })).toEqual(user)
  })

  it.each([
    ['an unknown role', { ...user, role: 'superuser' }],
    ['a missing email', { ...user, email: undefined }],
    ['a verification flag that is not a boolean', { ...user, emailVerified: 'yes' }],
  ])('rejects %s', (_case, broken) => {
    expect(() => parseAccountResponse({ user: broken })).toThrow(expect.objectContaining({ code: 'unexpected_response' }))
  })
})
