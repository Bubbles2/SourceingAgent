import type { Request } from 'express'

/** One cookie's value from the request, or null when it's absent or malformed. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) {
    return null
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1 || part.slice(0, separator).trim() !== name) {
      continue
    }
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}
