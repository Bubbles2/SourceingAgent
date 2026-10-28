// Plain-text emails for account verification and password reset. Tokens go in the URL fragment
// (#token=…), which browsers never send to servers or in Referer headers.
import { config } from '../../config/env.ts'
import type { OutgoingEmail } from '../../repositories/emailOutboxRepository.ts'
import type { UserRecord } from '../../repositories/usersRepository.ts'

export const emailVerificationHours = 48
export const passwordResetMinutes = 60

function link(path: string, token: string): string {
  return `${config.appOrigin}${path}#token=${token}`
}

export function verificationEmail(user: UserRecord, token: string): OutgoingEmail {
  return {
    to: user.email,
    template: 'email_verification',
    subject: 'Confirm your email address',
    bodyText: [
      `Hello ${user.firstName},`,
      '',
      'Please confirm your email address for Parisien Sourcing Agent by opening this link:',
      '',
      link('/verify-email', token),
      '',
      `The link works once and expires in ${emailVerificationHours} hours.`,
      "If you didn't create an account, you can ignore this email.",
    ].join('\n'),
  }
}

export function passwordResetEmail(user: UserRecord, token: string): OutgoingEmail {
  return {
    to: user.email,
    template: 'password_reset',
    subject: 'Reset your password',
    bodyText: [
      `Hello ${user.firstName},`,
      '',
      'We received a request to reset your Parisien Sourcing Agent password. Choose a new one here:',
      '',
      link('/reset-password', token),
      '',
      `The link works once and expires in ${passwordResetMinutes} minutes. Resetting your password signs you out everywhere.`,
      "If you didn't ask for this, you can ignore this email; your password won't change.",
    ].join('\n'),
  }
}
