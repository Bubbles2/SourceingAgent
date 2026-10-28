// Business rules for the form's instant feedback; the API enforces the same rules on submission.
import { formatEur } from '../../utils/money'
import type { Catalogue } from '../auctions/types'

export const bidLimits = {
  minEur: 20,
  maxEur: 5_000_000,
  instructionsMaxLength: 1000,
} as const

export function checkLotNumber(catalogue: Pick<Catalogue, 'lots'>, lotNumber: number): string | null {
  const { first, last } = catalogue.lots
  return lotNumber >= first && lotNumber <= last ? null : `Lot numbers in this catalogue run from ${first} to ${last}.`
}

export function checkMaxBid(amount: number): string | null {
  if (amount < bidLimits.minEur) {
    return `Enter a maximum bid of at least ${formatEur(bidLimits.minEur)}.`
  }
  if (amount > bidLimits.maxEur) {
    return `For maximum bids above ${formatEur(bidLimits.maxEur)}, please contact the agent directly.`
  }
  return null
}
