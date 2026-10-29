// zod building blocks shared by the API's request schemas.
import { z } from 'zod'

/** A database key: the digits of a positive bigint, kept to 15 so it stays well inside bigint's range */
export function isDatabaseId(value: string): boolean {
  return /^[1-9][0-9]{0,14}$/.test(value)
}

export function databaseIdField(message: string) {
  return z.string({ error: message }).refine(isDatabaseId, message)
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
