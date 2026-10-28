// The rules match the website's Request a bid form, so customers see the same messages either way.
import { z } from 'zod'

export const bidLimits = { minEur: 20, maxEur: 5_000_000, instructionsMaxLength: 1000 } as const

const euros = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function slug(message: string) {
  return z.string({ error: message }).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, message).max(120, message)
}

export const createBidRequestBody = z.object({
  auctionId: slug('Choose the auction you want the agent to bid at.'),
  catalogueId: slug('Choose the catalogue that lists your lot.'),
  lotNumber: z
    .number({ error: 'Enter the lot number using digits only, for example 45.' })
    .int('Enter the lot number using digits only, for example 45.')
    .positive('Enter the lot number using digits only, for example 45.'),
  // Whole euros: the hammer price the customer authorises, excluding all fees and charges
  maxBidEur: z
    .number({ error: 'Enter a whole number of euros, for example 2,500.' })
    .int('Enter a whole number of euros, for example 2,500.')
    .min(bidLimits.minEur, `Enter a maximum bid of at least ${euros.format(bidLimits.minEur)}.`)
    .max(bidLimits.maxEur, `For maximum bids above ${euros.format(bidLimits.maxEur)}, please contact the agent directly.`),
  instructions: z
    .string()
    .trim()
    .max(bidLimits.instructionsMaxLength, `Keep instructions to ${bidLimits.instructionsMaxLength.toLocaleString('en-GB')} characters or fewer.`)
    .default(''),
})

export type CreateBidRequestBody = z.infer<typeof createBidRequestBody>
