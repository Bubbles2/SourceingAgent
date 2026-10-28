// Request bodies for the auth endpoints. The rules match the website's forms, so customers see
// the same messages either way; these are the ones that are enforced.
import { z } from 'zod'
import { isCountryCode } from '../../lib/countries.ts'

const email = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(254, 'Email address must be 254 characters or fewer.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter an email address in the correct format, like name@example.com.')

// Length in characters (code points), with no composition rules; long passphrases are welcome.
const newPassword = z
  .string({ error: 'Enter a password.' })
  .refine((value) => [...value].length >= 12, 'Your password must be at least 12 characters.')
  .refine((value) => [...value].length <= 128, 'Your password must be 128 characters or fewer.')

// Only a sanity limit when signing in, so long inputs can't tie up the password hashing.
const currentPassword = z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(1024, 'Enter your password.')

function name(label: string) {
  return z
    .string({ error: `Enter your ${label}.` })
    .trim()
    .min(1, `Enter your ${label}.`)
    .max(100, `${label.charAt(0).toUpperCase()}${label.slice(1)} must be 100 characters or fewer.`)
}

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim().replace(/\s+/g, ' ') || null)

const token = z.string({ error: 'This link is invalid or has expired.' }).regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid or has expired.')

export const registerBody = z.object({
  firstName: name('first name'),
  lastName: name('last name'),
  email,
  password: newPassword,
  countryCode: z.string({ error: 'Choose the country you live in.' }).refine(isCountryCode, 'Choose a country from the list.'),
  companyName: optionalText.refine(
    (value) => value === null || value.length <= 200,
    'Company name must be 200 characters or fewer.',
  ),
  telephone: optionalText.refine((value) => {
    if (value === null) {
      return true
    }
    const digits = value.replace(/\D/g, '').length
    return /^\+?[\d ().-]+$/.test(value) && digits >= 6 && digits <= 15
  }, 'Enter a telephone number with 6 to 15 digits, including the country code.'),
})

export const signInBody = z.object({
  email,
  password: currentPassword,
})

export const passwordResetRequestBody = z.object({ email })

export const passwordResetBody = z.object({
  token,
  password: newPassword,
})

export const emailVerificationBody = z.object({ token })

export type RegisterBody = z.infer<typeof registerBody>
export type SignInBody = z.infer<typeof signInBody>
export type PasswordResetRequestBody = z.infer<typeof passwordResetRequestBody>
export type PasswordResetBody = z.infer<typeof passwordResetBody>
export type EmailVerificationBody = z.infer<typeof emailVerificationBody>
