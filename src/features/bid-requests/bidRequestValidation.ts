// Client-side validation for the bid request form: instant, helpful feedback only.
// The API checks everything again on submission.
import { parseWholeEuros } from '../../utils/money'
import type { AuctionWithCatalogues } from '../auctions/types'
import { bidLimits, checkLotNumber, checkMaxBid } from './bidRequestRules'
import type { BidRequestInput } from './types'

export type BidRequestFormValues = {
  auctionId: string
  catalogueId: string
  lotNumber: string
  maxBid: string
  instructions: string
  acknowledgedCharges: boolean
}

export type BidRequestField = keyof BidRequestFormValues

/** Errors by field; `form` holds problems with the whole request, such as needing to sign in again. */
export type BidRequestErrors = Partial<Record<BidRequestField | 'form', string>>

/** Form order, used to list errors in the summary */
export const bidRequestFields: readonly BidRequestField[] = [
  'auctionId',
  'catalogueId',
  'lotNumber',
  'maxBid',
  'instructions',
  'acknowledgedCharges',
]

type ValidationResult = { errors: BidRequestErrors; input: BidRequestInput | null }

export function validateBidRequest(
  values: BidRequestFormValues,
  auctions: readonly AuctionWithCatalogues[],
): ValidationResult {
  const errors: BidRequestErrors = {}

  const auction = auctions.find((candidate) => candidate.id === values.auctionId)
  if (!values.auctionId) {
    errors.auctionId = 'Choose the auction you want the agent to bid at.'
  } else if (!auction) {
    errors.auctionId = 'This sale is no longer taking bid requests. Choose another auction.'
  }

  const catalogue = auction?.catalogues.find((candidate) => candidate.id === values.catalogueId)
  if (auction && auction.catalogues.length === 0) {
    errors.catalogueId = "This sale's catalogue isn't published yet, so requests open once it is."
  } else if (!values.catalogueId) {
    errors.catalogueId = 'Choose the catalogue that lists your lot.'
  } else if (auction && !catalogue) {
    errors.catalogueId = 'Choose a catalogue from the selected sale.'
  }

  const lotText = values.lotNumber.trim()
  const lotNumber = /^\d+$/.test(lotText) ? Number(lotText) : null
  if (!lotText) {
    errors.lotNumber = 'Enter the lot number from the catalogue.'
  } else if (lotNumber === null) {
    errors.lotNumber = 'Enter the lot number using digits only, for example 45.'
  } else if (catalogue) {
    addError(errors, 'lotNumber', checkLotNumber(catalogue, lotNumber))
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
  if (hasErrors || !auction || !catalogue || lotNumber === null || maxBidEur === null) {
    return { errors, input: null }
  }

  return {
    errors: {},
    input: {
      auctionId: auction.id,
      catalogueId: catalogue.id,
      lotNumber,
      maxBidEur,
      instructions: values.instructions.trim(),
    },
  }
}

function addError(errors: BidRequestErrors, field: BidRequestField, message: string | null): void {
  if (message) {
    errors[field] = message
  }
}
