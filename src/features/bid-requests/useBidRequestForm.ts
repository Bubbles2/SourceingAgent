import { use, useState, useTransition } from 'react'
import type { Auction } from '../auctions/types'
import { loadAuctionLots, type AuctionLotsResult } from '../lots/lotService'
import { submitBidRequest } from './bidRequestService'
import {
  validateBidRequest,
  type BidRequestErrors,
  type BidRequestField,
  type BidRequestFormValues,
} from './bidRequestValidation'
import type { MyBidRequest } from './types'

type UseBidRequestFormOptions = {
  auctions: readonly Auction[]
  initialAuctionId: string | null
  initialLotId: string | null
  /** The pre-selected sale's lots, already requested by the route loader */
  initialLots: Promise<AuctionLotsResult> | null
}

/** The lots of one sale, as they load */
type LotsRequest = {
  auctionId: string
  result: Promise<AuctionLotsResult> | null
}

const emptyValues: BidRequestFormValues = {
  auctionId: '',
  lotId: '',
  maxBid: '',
  instructions: '',
  acknowledgedCharges: false,
}

function initialValues({ auctions, initialAuctionId, initialLotId }: UseBidRequestFormOptions): BidRequestFormValues {
  const auction = auctions.find((candidate) => candidate.id === initialAuctionId)
  return { ...emptyValues, auctionId: auction?.id ?? '', lotId: auction ? (initialLotId ?? '') : '' }
}

export function useBidRequestForm(options: UseBidRequestFormOptions) {
  const { auctions } = options
  const [values, setValues] = useState(() => initialValues(options))
  const [lotsRequest, setLotsRequest] = useState<LotsRequest>(() => ({
    auctionId: options.initialAuctionId ?? '',
    result: options.initialLots,
  }))
  // A new sale's lots load in a transition, so the form stays on screen while they arrive.
  const [isLoadingLots, startLoadingLots] = useTransition()
  const [errors, setErrors] = useState<BidRequestErrors>({})
  // Errors only appear after the first submit; from then on they update as the customer edits.
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedRequest, setSubmittedRequest] = useState<MyBidRequest | null>(null)

  const selectedAuction = auctions.find((auction) => auction.id === values.auctionId)
  const lotsAreCurrent = selectedAuction !== undefined && lotsRequest.auctionId === values.auctionId
  const lotsResult = lotsAreCurrent && lotsRequest.result ? use(lotsRequest.result) : null
  const lots = lotsResult?.ok ? lotsResult.lots : null
  // A pre-selected lot that isn't in the sale is dropped once the sale's lots are known.
  const lotId = lots && !lots.some((lot) => lot.id === values.lotId) ? '' : values.lotId
  const selectedLot = lots?.find((lot) => lot.id === lotId)
  const currentValues = { ...values, lotId }

  function loadLots(auctionId: string): void {
    startLoadingLots(() => {
      setLotsRequest({ auctionId, result: auctionId ? loadAuctionLots(auctionId) : null })
    })
  }

  function updateValues(next: BidRequestFormValues): void {
    setValues(next)
    if (failedSubmits > 0) {
      setErrors(validateBidRequest(next, auctions, next.auctionId === values.auctionId ? lots : null).errors)
    }
  }

  function setField<Field extends BidRequestField>(field: Field, value: BidRequestFormValues[Field]): void {
    if (field === 'auctionId') {
      updateValues({ ...currentValues, auctionId: String(value), lotId: '' })
      loadLots(String(value))
      return
    }
    updateValues({ ...currentValues, [field]: value })
  }

  async function submit(): Promise<void> {
    const { errors: validationErrors, input } = validateBidRequest(currentValues, auctions, lots)
    if (!input) {
      setErrors(validationErrors)
      setFailedSubmits((count) => count + 1)
      return
    }

    setIsSubmitting(true)
    let result: Awaited<ReturnType<typeof submitBidRequest>>
    try {
      result = await submitBidRequest(input)
    } catch (error) {
      // API refusals come back as form errors, so this is a bug: keep it visible to developers.
      console.error(error)
      result = { ok: false, errors: { form: 'Something went wrong on our side. Please try again.' } }
    }
    setIsSubmitting(false)

    if (!result.ok) {
      setErrors(result.errors)
      setFailedSubmits((count) => count + 1)
      return
    }
    setErrors({})
    setFailedSubmits(0)
    setSubmittedRequest(result.request)
  }

  /** Start another request for the same sale. */
  function startAnother(): void {
    setValues({ ...emptyValues, auctionId: values.auctionId })
    setErrors({})
    setFailedSubmits(0)
    setSubmittedRequest(null)
  }

  return {
    values: currentValues,
    errors,
    failedSubmits,
    isSubmitting,
    submittedRequest,
    selectedAuction,
    selectedLot,
    /** The chosen sale's lots; null until they have loaded */
    lots,
    lotsLoading: isLoadingLots || (selectedAuction !== undefined && !lotsAreCurrent),
    lotsError: lotsResult && !lotsResult.ok ? lotsResult.message : null,
    retryLots: () => loadLots(values.auctionId),
    setField,
    submit,
    startAnother,
  }
}
