import type { FormEvent } from 'react'
import { AmountField } from '../../components/form/AmountField'
import { CheckboxField } from '../../components/form/CheckboxField'
import { ErrorSummary, type FormError } from '../../components/form/ErrorSummary'
import { SelectField, type SelectOption } from '../../components/form/SelectField'
import { TextAreaField } from '../../components/form/TextAreaField'
import { TextField } from '../../components/form/TextField'
import { Button } from '../../components/ui/Button'
import { formatEur } from '../../utils/money'
import { formatSaleDateShort } from '../auctions/formatAuction'
import type { AuctionWithCatalogues } from '../auctions/types'
import { BidRequestConfirmation } from './BidRequestConfirmation'
import { bidLimits } from './bidRequestRules'
import { bidRequestFields, type BidRequestField } from './bidRequestValidation'
import { PricingNotice } from './PricingNotice'
import { SelectedSaleSummary } from './SelectedSaleSummary'
import { useBidRequestForm } from './useBidRequestForm'
import './BidRequestForm.css'

const fieldIds: Record<BidRequestField, string> = {
  auctionId: 'bid-auction',
  catalogueId: 'bid-catalogue',
  lotNumber: 'bid-lot',
  maxBid: 'bid-max',
  instructions: 'bid-instructions',
  acknowledgedCharges: 'bid-acknowledge',
}
const pricingNoticeId = 'bid-pricing-notice'

type BidRequestFormProps = {
  /** Sales open for requests */
  auctions: readonly AuctionWithCatalogues[]
  initialAuctionId: string | null
  initialCatalogueId: string | null
}

export function BidRequestForm({ auctions, initialAuctionId, initialCatalogueId }: BidRequestFormProps): React.JSX.Element {
  const form = useBidRequestForm({ auctions, initialAuctionId, initialCatalogueId })
  const { values, errors, selectedAuction, selectedCatalogue, setField } = form

  if (form.submittedRequest) {
    return <BidRequestConfirmation request={form.submittedRequest} onRequestAnother={form.startAnother} />
  }

  const auctionOptions: SelectOption[] = auctions.map((auction) => ({
    value: auction.id,
    label: `${formatSaleDateShort(auction.saleDate)} · ${auction.title} · ${auction.house}${
      auction.catalogues.length === 0 ? ' (catalogue not yet published)' : ''
    }`,
  }))
  const catalogueOptions: SelectOption[] = (selectedAuction?.catalogues ?? []).map((catalogue) => ({
    value: catalogue.id,
    label: `${catalogue.title} (lots ${catalogue.lots.first}–${catalogue.lots.last})`,
  }))
  const fieldErrors: FormError[] = bidRequestFields.flatMap((field) => {
    const message = errors[field]
    return message ? [{ fieldId: fieldIds[field], message }] : []
  })
  const summaryErrors: FormError[] = errors.form ? [{ message: errors.form }, ...fieldErrors] : fieldErrors

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function handleAuctionChange(value: string): void {
    setField('auctionId', value)
  }

  function handleCatalogueChange(value: string): void {
    setField('catalogueId', value)
  }

  function handleLotChange(value: string): void {
    setField('lotNumber', value)
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
            id={fieldIds.catalogueId}
            label="Catalogue"
            required
            placeholder={selectedAuction ? 'Choose a catalogue' : 'Choose an auction first'}
            value={values.catalogueId}
            options={catalogueOptions}
            disabled={catalogueOptions.length === 0}
            hint={
              selectedAuction && catalogueOptions.length === 0
                ? "This sale's catalogue isn't published yet, so requests open once it is."
                : undefined
            }
            error={errors.catalogueId}
            onChange={handleCatalogueChange}
          />
          <div className="form-row">
            <TextField
              id={fieldIds.lotNumber}
              label="Lot number"
              required
              inputMode="numeric"
              className="bid-form__lot"
              value={values.lotNumber}
              hint={
                selectedCatalogue
                  ? `This catalogue lists lots ${selectedCatalogue.lots.first}–${selectedCatalogue.lots.last}.`
                  : 'As printed in the catalogue.'
              }
              error={errors.lotNumber}
              onChange={handleLotChange}
            />
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

      <SelectedSaleSummary auction={selectedAuction} catalogue={selectedCatalogue} />
    </div>
  )
}
