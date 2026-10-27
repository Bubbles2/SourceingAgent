const eurFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const groupedFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/** "€12,500" */
export function formatEur(amount: number): string {
  return eurFormatter.format(amount)
}

/** "12,500" — for an amount field that shows its own € prefix */
export function formatAmountForInput(amount: number): string {
  return groupedFormatter.format(amount)
}

/**
 * Reads a whole-euro amount typed by a customer: "12500", "12,500" and "12 500" all give 12500.
 * Returns null for anything else, including decimals.
 */
export function parseWholeEuros(text: string): number | null {
  const digits = text.replace(/[\s,  ]/g, '')
  if (!/^\d+$/.test(digits)) {
    return null
  }
  const amount = Number(digits)
  return Number.isSafeInteger(amount) ? amount : null
}
