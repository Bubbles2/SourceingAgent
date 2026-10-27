import { useState } from 'react'
import type { AuctionWithCatalogues } from '../auctions/types'
import { submitBidRequest, type SubmitBidRequestError } from './bidRequestService'
import {
  validateBidRequest,
  type BidRequestErrors,
  type BidRequestField,
  type BidRequestFormValues,
} from './bidRequestValidation'
import type { MyBidRequest } from './types'

type UseBidRequestFormOptions = {
  auctions: readonly AuctionWithCatalogues[]
  initialAuctionId: string | null
  initialCatalogueId: string | null
}

const emptyValues: BidRequestFormValues = {
  auctionId: '',
  catalogueId: '',
  lotNumber: '',
  maxBid: '',
  instructions: '',
  acknowledgedCharges: false,
}

const serverErrorFields: Record<SubmitBidRequestError['code'], BidRequestField> = {
  'sale-closed': 'auctionId',
  'catalogue-mismatch': 'catalogueId',
  'lot-out-of-range': 'lotNumber',
  'invalid-amount': 'maxBid',
  'lot-reserved': 'lotNumber',
  'already-requested': 'lotNumber',
}

/** A sale with a single catalogue gets it pre-selected. */
function defaultCatalogueId(auction: AuctionWithCatalogues | undefined, preferredId: string | null): string {
  if (!auction) {
    return ''
  }
  if (preferredId && auction.catalogues.some((catalogue) => catalogue.id === preferredId)) {
    return preferredId
  }
  return auction.catalogues.length === 1 ? auction.catalogues[0].id : ''
}

function initialValues({ auctions, initialAuctionId, initialCatalogueId }: UseBidRequestFormOptions): BidRequestFormValues {
  const auction = auctions.find((candidate) => candidate.id === initialAuctionId)
  return {
    ...emptyValues,
    auctionId: auction?.id ?? '',
    catalogueId: defaultCatalogueId(auction, initialCatalogueId),
  }
}

export function useBidRequestForm(options: UseBidRequestFormOptions) {
  const { auctions } = options
  const [values, setValues] = useState(() => initialValues(options))
  const [errors, setErrors] = useState<BidRequestErrors>({})
  // Errors only appear after the first submit; from then on they update as the customer edits.
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedRequest, setSubmittedRequest] = useState<MyBidRequest | null>(null)

  const selectedAuction = auctions.find((auction) => auction.id === values.auctionId)
  const selectedCatalogue = selectedAuction?.catalogues.find((catalogue) => catalogue.id === values.catalogueId)

  function updateValues(next: BidRequestFormValues): void {
    setValues(next)
    if (failedSubmits > 0) {
      setErrors(validateBidRequest(next, auctions).errors)
    }
  }

  function setField<Field extends BidRequestField>(field: Field, value: BidRequestFormValues[Field]): void {
    if (field === 'auctionId') {
      const auction = auctions.find((candidate) => candidate.id === value)
      updateValues({ ...values, auctionId: String(value), catalogueId: defaultCatalogueId(auction, null), lotNumber: '' })
      return
    }
    if (field === 'catalogueId') {
      updateValues({ ...values, catalogueId: String(value), lotNumber: '' })
      return
    }
    updateValues({ ...values, [field]: value })
  }

  async function submit(): Promise<void> {
    const { errors: validationErrors, input } = validateBidRequest(values, auctions)
    if (!input) {
      setErrors(validationErrors)
      setFailedSubmits((count) => count + 1)
      return
    }

    setIsSubmitting(true)
    const result = await submitBidRequest(input)
    setIsSubmitting(false)

    if (!result.ok) {
      setErrors({ [serverErrorFields[result.code]]: result.message })
      setFailedSubmits((count) => count + 1)
      return
    }
    setErrors({})
    setFailedSubmits(0)
    setSubmittedRequest(result.request)
  }

  /** Start another request for the same sale and catalogue. */
  function startAnother(): void {
    setValues({ ...emptyValues, auctionId: values.auctionId, catalogueId: values.catalogueId })
    setErrors({})
    setFailedSubmits(0)
    setSubmittedRequest(null)
  }

  return {
    values,
    errors,
    failedSubmits,
    isSubmitting,
    submittedRequest,
    selectedAuction,
    selectedCatalogue,
    setField,
    submit,
    startAnother,
  }
}
