// Text and links the auction monitor collected from other websites, made safe to show.
import { isPublicHttpsUrl } from './validationFields.ts'

const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Collected text can still hold HTML entities, such as "Fine Arts &amp; Antiques". The website shows
 * text as text, so they are turned back into characters.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entity, name: string) => {
    if (name.startsWith('#')) {
      const code = /^#[xX]/.test(name) ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return namedEntities[name.toLowerCase()] ?? entity
  })
}

export function decodeOptional(text: string | null): string | null {
  return text === null ? null : decodeHtmlEntities(text)
}

/** A collected link, only when it is a public https:// address; anything else could be unsafe to follow. */
export function safeLink(url: string | null): string | null {
  return url !== null && isPublicHttpsUrl(url) ? url : null
}
