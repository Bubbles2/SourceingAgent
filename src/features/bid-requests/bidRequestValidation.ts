// Client-side validation for the bid request form: instant, helpful feedback only.
// The API checks everything again on submission.
import { parseWholeEuros } from '../../utils/money'
import type { Auction } from '../auctions/types'
import type { LotSummary } from '../lots/types'
import { bidLimits, checkMaxBid } from './bidRequestRules'
import type { BidRequestInput } from './types'

export type BidRequestFormValues = {
  auctionId: string
  lotId: string
  maxBid: string
  instructions: string
  acknowledgedCharges: boolean
}

export type BidRequestField = keyof BidRequestFormValues

/** Errors by field; `form` holds problems with the whole request, such as needing to sign in again. */
export type BidRequestErrors = Partial<Record<BidRequestField | 'form', string>>

/** Form order, used to list errors in the summary */
export const bidRequestFields: readonly BidRequestField[] = ['auctionId', 'lotId', 'maxBid', 'instructions', 'acknowledgedCharges']

type ValidationResult = { errors: BidRequestErrors; input: BidRequestInput | null }

/**
 * `lots` are the chosen sale's lots, or null while they load (or couldn't be loaded); a lot is
 * only checked against them once they are known.
 */
export function validateBidRequest(
  values: BidRequestFormValues,
  auctions: readonly Auction[],
  lots: readonly LotSummary[] | null,
): ValidationResult {
  const errors: BidRequestErrors = {}

  const auction = auctions.find((candidate) => candidate.id === values.auctionId)
  if (!values.auctionId) {
    errors.auctionId = 'Choose the auction you want the agent to bid at.'
  } else if (!auction) {
    errors.auctionId = 'This sale is no longer taking bid requests. Choose another auction.'
  }

  if (auction && lots?.length === 0) {
    errors.lotId = "This sale's lots aren't published yet, so requests open once they are."
  } else if (!values.lotId) {
    errors.lotId = 'Choose the lot you want the agent to bid on.'
  } else if (auction && lots && !lots.some((lot) => lot.id === values.lotId)) {
    errors.lotId = 'Choose a lot from the selected sale.'
  }

  const maxBidEur = parseWholeEuros(values.maxBid)
  if (!values.maxBid.trim()) {
    errors.maxBid = 'Enter your maximum bid in euros.'
  } else if (maxBidEur === null) {
    errors.maxBid = 'Enter a whole number of euros, for example 2,500.'
  } else {
    addError(errors, 'maxBid', checkMaxBid(maxBidEur))
  }

  if (values.instructions.length > bidLimits.instructionsMaxLength) {
    errors.instructions = `Keep instructions to ${bidLimits.instructionsMaxLength.toLocaleString('en-GB')} characters or fewer.`
  }

  if (!values.acknowledgedCharges) {
    errors.acknowledgedCharges = 'Confirm that you understand what your maximum bid covers.'
  }

  const hasErrors = bidRequestFields.some((field) => errors[field])
  if (hasErrors || !auction || maxBidEur === null) {
    return { errors, input: null }
  }

  return {
    errors: {},
    input: {
      auctionId: auction.id,
      lotId: values.lotId,
      maxBidEur,
      instructions: values.instructions.trim(),
      acknowledgedCharges: true,
    },
  }
}

function addError(errors: BidRequestErrors, field: BidRequestField, message: string | null): void {
  if (message) {
    errors[field] = message
  }
}
