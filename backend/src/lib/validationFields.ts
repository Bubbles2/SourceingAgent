// zod building blocks shared by the API's request schemas.
import { z } from 'zod'

/** A public id made of lower-case words, such as vauclair-tableaux-anciens-2026-11 */
export function slugField(message: string) {
  return z.string({ error: message }).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, message).max(120, message)
}

/** Required text, trimmed */
export function requiredText(maxLength: number, message: string) {
  return z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(maxLength, `Keep this to ${maxLength.toLocaleString('en-GB')} characters or fewer.`)
}

/** An https:// address on a named public host, without a user name or password in it. */
export function isPublicHttpsUrl(value: string): boolean {
  if (!URL.canParse(value)) {
    return false
  }
  const { protocol, username, password, hostname } = new URL(value)
  return (
    protocol === 'https:' &&
    username === '' &&
    password === '' &&
    hostname.includes('.') &&
    !hostname.endsWith('.localhost') &&
    // IP addresses: IPv6 hosts are bracketed, IPv4 hosts are only digits and dots
    !hostname.startsWith('[') &&
    !/^[\d.]+$/.test(hostname)
  )
}

/**
 * A path on this site, such as /images/sale.jpg, never //other.example or /\other.example. Control
 * characters are refused too: browsers drop tabs and newlines, so "/\t/other.example" would become
 * "//other.example".
 */
export function isSitePath(value: string): boolean {
  return /^\/[^/\\]/.test(value) && !/[\u0000-\u001f\u007f]/.test(value)
}

/** An https:// address, at most `maxLength` characters long */
export function httpsUrlField(message: string, maxLength = 2048) {
  return z
    .string({ error: message })
    .trim()
    .max(maxLength, `Keep the address to ${maxLength.toLocaleString('en-GB')} characters or fewer.`)
    .refine(isPublicHttpsUrl, message)
}

/** A picture, from an https:// address or a path on this site (/images/…), with a text alternative */
export const imageField = z.object({
  src: z
    .string({ error: 'Enter the image address.' })
    .trim()
    .max(2048, 'Keep the address to 2,048 characters or fewer.')
    .refine(
      (src) => isPublicHttpsUrl(src) || isSitePath(src),
      'Use an https:// address or a path on this site, such as /images/sale.jpg.',
    ),
  alt: requiredText(300, "Describe the image for people who can't see it."),
})

/** limit and offset query parameters for paged lists */
export function pageQuery(defaultLimit: number) {
  return {
    limit: z.coerce
      .number({ error: 'limit must be a whole number from 1 to 100.' })
      .int('limit must be a whole number from 1 to 100.')
      .min(1, 'limit must be a whole number from 1 to 100.')
      .max(100, 'limit must be a whole number from 1 to 100.')
      .default(defaultLimit),
    offset: z.coerce
      .number({ error: 'offset must be a whole number, 0 or more.' })
      .int('offset must be a whole number, 0 or more.')
      .min(0, 'offset must be a whole number, 0 or more.')
      .default(0),
  }
}
