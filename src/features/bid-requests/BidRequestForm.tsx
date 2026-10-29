import type { FormEvent } from 'react'
import { AmountField } from '../../components/form/AmountField'
import { CheckboxField } from '../../components/form/CheckboxField'
import { ErrorSummary, type FormError } from '../../components/form/ErrorSummary'
import { SelectField, type SelectOption } from '../../components/form/SelectField'
import { TextAreaField } from '../../components/form/TextAreaField'
import { Button } from '../../components/ui/Button'
import { formatEur } from '../../utils/money'
import { formatSaleLine } from '../auctions/formatAuction'
import type { Auction } from '../auctions/types'
import type { AuctionLotsResult } from '../lots/lotService'
import { lotOptionLabel } from '../lots/lotText'
import { BidRequestConfirmation } from './BidRequestConfirmation'
import { bidLimits } from './bidRequestRules'
import { bidRequestFields, type BidRequestField } from './bidRequestValidation'
import { PricingNotice } from './PricingNotice'
import { SelectedSaleSummary } from './SelectedSaleSummary'
import { useBidRequestForm } from './useBidRequestForm'
import './BidRequestForm.css'

const fieldIds: Record<BidRequestField, string> = {
  auctionId: 'bid-auction',
  lotId: 'bid-lot',
  maxBid: 'bid-max',
  instructions: 'bid-instructions',
  acknowledgedCharges: 'bid-acknowledge',
}
const pricingNoticeId = 'bid-pricing-notice'

type BidRequestFormProps = {
  /** Sales open for requests */
  auctions: readonly Auction[]
  initialAuctionId: string | null
  initialLotId: string | null
  initialLots: Promise<AuctionLotsResult> | null
}

export function BidRequestForm({ auctions, initialAuctionId, initialLotId, initialLots }: BidRequestFormProps): React.JSX.Element {
  const form = useBidRequestForm({ auctions, initialAuctionId, initialLotId, initialLots })
  const { values, errors, selectedAuction, selectedLot, lots, setField } = form

  if (form.submittedRequest) {
    return <BidRequestConfirmation request={form.submittedRequest} onRequestAnother={form.startAnother} />
  }

  const auctionOptions: SelectOption[] = auctions.map((auction) => ({
    value: auction.id,
    label: `${formatSaleLine(auction)} · ${auction.title}${auction.lotCount === 0 ? ' (lots not yet published)' : ''}`,
  }))
  const lotOptions: SelectOption[] = (lots ?? []).map((lot) => ({ value: lot.id, label: lotOptionLabel(lot) }))
  const fieldErrors: FormError[] = bidRequestFields.flatMap((field) => {
    const message = errors[field]
    return message ? [{ fieldId: fieldIds[field], message }] : []
  })
  const summaryErrors: FormError[] = errors.form ? [{ message: errors.form }, ...fieldErrors] : fieldErrors

  function lotPlaceholder(): string {
    if (!selectedAuction) {
      return 'Choose an auction first'
    }
    if (form.lotsLoading) {
      return 'Loading the lots…'
    }
    if (lots?.length === 0) {
      return 'No lots published yet'
    }
    return 'Choose a lot'
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function handleAuctionChange(value: string): void {
    setField('auctionId', value)
  }

  function handleLotChange(value: string): void {
    setField('lotId', value)
  }

  function handleMaxBidChange(value: string): void {
    setField('maxBid', value)
  }

  function handleInstructionsChange(value: string): void {
    setField('instructions', value)
  }

  function handleAcknowledgeChange(checked: boolean): void {
    setField('acknowledgedCharges', checked)
  }

  return (
    <div className="request-bid">
      <form className="bid-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
        {summaryErrors.length > 0 ? <ErrorSummary key={form.failedSubmits} errors={summaryErrors} /> : null}

        <fieldset className="form-section">
          <legend className="form-section__legend">Which lot?</legend>
          <SelectField
            id={fieldIds.auctionId}
            label="Auction"
            required
            placeholder="Choose an upcoming auction"
            value={values.auctionId}
            options={auctionOptions}
            error={errors.auctionId}
            onChange={handleAuctionChange}
          />
          <SelectField
            id={fieldIds.lotId}
            label="Lot"
            required
            placeholder={lotPlaceholder()}
            value={values.lotId}
            options={lotOptions}
            disabled={form.lotsLoading || lotOptions.length === 0}
            hint={
              selectedAuction && lots?.length === 0
                ? "This sale's lots aren't published yet, so requests open once they are."
                : 'Lot number and title, as the auction house lists them.'
            }
            error={errors.lotId}
            onChange={handleLotChange}
          />
          {form.lotsError ? (
            <p className="bid-form__lots-error" role="alert">
              {`We couldn't load this sale's lots. ${form.lotsError}`}
              <Button variant="link" onClick={form.retryLots}>
                Try again
              </Button>
            </p>
          ) : null}
          <div className="bid-form__amount">
            <AmountField
              id={fieldIds.maxBid}
              label="Maximum bid (EUR)"
              required
              value={values.maxBid}
              hint={`Whole euros, from ${formatEur(bidLimits.minEur)}. The hammer price only.`}
              error={errors.maxBid}
              onChange={handleMaxBidChange}
            />
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section__legend">Anything the agent should know?</legend>
          <TextAreaField
            id={fieldIds.instructions}
            label="Instructions for the agent"
            maxLength={bidLimits.instructionsMaxLength}
            placeholder="For example: only bid if the condition report confirms there is no restoration."
            value={values.instructions}
            error={errors.instructions}
            onChange={handleInstructionsChange}
          />
        </fieldset>

        <div className="form-section">
          <PricingNotice id={pricingNoticeId} />
          <CheckboxField
            id={fieldIds.acknowledgedCharges}
            required
            checked={values.acknowledgedCharges}
            describedById={pricingNoticeId}
            error={errors.acknowledgedCharges}
            onChange={handleAcknowledgeChange}
          >
            I understand that my maximum bid is the hammer price only, and that the fees, premiums, taxes and charges
            listed above are payable on top of it.
          </CheckboxField>
          <div className="bid-form__actions">
            <Button type="submit" size="lg" disabled={form.isSubmitting}>
              {form.isSubmitting ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </div>
      </form>

      <SelectedSaleSummary auction={selectedAuction} lot={selectedLot} />
    </div>
  )
}
