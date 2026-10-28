/** An https:// address on a named host. The API checks links more strictly; this catches typos early. */
export function isHttpsUrl(value: string): boolean {
  if (!URL.canParse(value)) {
    return false
  }
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname.includes('.') && url.username === '' && url.password === ''
}

/** A path on this site, such as /images/sale.jpg (not //other-site.example) */
export function isSitePath(value: string): boolean {
  return /^\/[^/\\]/.test(value)
}

/** A readable id from a title: "Arts décoratifs & design" becomes "arts-decoratifs-design". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Lower-case words joined by hyphens, as the API expects for ids */
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
