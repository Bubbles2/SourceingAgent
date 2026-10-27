// Account rules shared by the forms (instant feedback) and the mock auth service (checks again on
// submission). Each check returns a customer-facing message, or null when the value is fine.
import { isCountryCode } from './countries'

export const accountLimits = {
  nameMaxLength: 100,
  emailMaxLength: 254,
  passwordMinLength: 12,
  passwordMaxLength: 128,
  companyMaxLength: 200,
  telephoneMinDigits: 6,
  telephoneMaxDigits: 15,
} as const

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const telephonePattern = /^\+?[\d\s().-]+$/

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizeTelephone(telephone: string): string {
  return telephone.trim().replace(/\s+/g, ' ')
}

/** Expects a trimmed email */
export function checkEmail(email: string): string | null {
  if (!email) {
    return 'Enter your email address.'
  }
  if (email.length > accountLimits.emailMaxLength) {
    return `Email address must be ${accountLimits.emailMaxLength} characters or fewer.`
  }
  if (!emailPattern.test(email)) {
    return 'Enter an email address in the correct format, like name@example.com.'
  }
  return null
}

/** Length only: no composition rules, so long passphrases are welcome. */
export function checkNewPassword(password: string): string | null {
  const length = [...password].length
  if (length === 0) {
    return 'Enter a password.'
  }
  if (length < accountLimits.passwordMinLength) {
    return `Your password must be at least ${accountLimits.passwordMinLength} characters.`
  }
  if (length > accountLimits.passwordMaxLength) {
    return `Your password must be ${accountLimits.passwordMaxLength} characters or fewer.`
  }
  return null
}

/** Expects a trimmed name */
export function checkName(name: string, label: 'first name' | 'last name'): string | null {
  if (!name) {
    return `Enter your ${label}.`
  }
  if (name.length > accountLimits.nameMaxLength) {
    const sentenceLabel = label.charAt(0).toUpperCase() + label.slice(1)
    return `${sentenceLabel} must be ${accountLimits.nameMaxLength} characters or fewer.`
  }
  return null
}

export function checkCountry(countryCode: string): string | null {
  if (!countryCode) {
    return 'Choose the country you live in.'
  }
  if (!isCountryCode(countryCode)) {
    return 'Choose a country from the list.'
  }
  return null
}

/** Optional; expects a trimmed name */
export function checkCompanyName(companyName: string): string | null {
  if (companyName.length > accountLimits.companyMaxLength) {
    return `Company name must be ${accountLimits.companyMaxLength} characters or fewer.`
  }
  return null
}

/** Optional; expects a normalised number */
export function checkTelephone(telephone: string): string | null {
  if (!telephone) {
    return null
  }
  if (!telephonePattern.test(telephone)) {
    return 'Enter a telephone number using digits, spaces and a + before the country code, like +33 1 23 45 67 89.'
  }
  const digits = telephone.replace(/\D/g, '').length
  if (digits < accountLimits.telephoneMinDigits || digits > accountLimits.telephoneMaxDigits) {
    return `Enter a telephone number with ${accountLimits.telephoneMinDigits} to ${accountLimits.telephoneMaxDigits} digits, including the country code.`
  }
  return null
}
