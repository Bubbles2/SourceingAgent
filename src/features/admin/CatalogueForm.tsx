import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { adminAuctionPath } from '../../app/paths'
import { ErrorSummary } from '../../components/form/ErrorSummary'
import { SelectField, type SelectOption } from '../../components/form/SelectField'
import { TextAreaField } from '../../components/form/TextAreaField'
import { TextField } from '../../components/form/TextField'
import { toSummaryErrors, useValidatedForm, type FormErrors } from '../../components/form/useValidatedForm'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ApiError } from '../../services/apiClient'
import { formatDayMonthYear } from '../auctions/formatAuction'
import type { AuctionWithCatalogues } from '../auctions/types'
import { formErrorsFromApi } from '../auth/apiFormErrors'
import { createCatalogue, deleteCatalogue, updateCatalogue } from './adminCatalogueService'
import { auctionStatusLabel } from './AuctionStatusBadge'
import {
  catalogueTextLimits,
  suggestCatalogueId,
  validateCatalogueForm,
  type CatalogueFormInput,
  type CatalogueFormValues,
} from './catalogueFormRules'
import { ConfirmDialog } from './ConfirmDialog'
import { flashState } from './flash'
import './AdminForm.css'

const fieldIds: Record<keyof CatalogueFormValues, string> = {
  auctionId: 'catalogue-auction',
  title: 'catalogue-title',
  description: 'catalogue-description',
  firstLot: 'catalogue-first-lot',
  lastLot: 'catalogue-last-lot',
  pageCount: 'catalogue-page-count',
  pdfUrl: 'catalogue-pdf-url',
  coverUrl: 'catalogue-cover-url',
  coverAlt: 'catalogue-cover-alt',
  id: 'catalogue-id',
}

const formFields = Object.keys(fieldIds) as (keyof CatalogueFormValues)[]

const codeFields: Partial<Record<string, keyof CatalogueFormValues>> = {
  catalogue_exists: 'id',
  lots_overlap: 'firstLot',
  requested_lots_outside_range: 'firstLot',
  catalogue_has_requests: 'auctionId',
}
const pathFields: Partial<Record<string, keyof CatalogueFormValues>> = {
  'body.lots': 'firstLot',
  'body.lots.first': 'firstLot',
  'body.lots.last': 'lastLot',
  'body.cover': 'coverUrl',
  'body.cover.src': 'coverUrl',
  'body.cover.alt': 'coverAlt',
}

/** "14 Nov 2026 · Tableaux anciens & dessins (Draft)" */
function auctionOption(auction: AuctionWithCatalogues): SelectOption {
  const status = auction.status === 'published' ? '' : ` (${auctionStatusLabel(auction.status)})`
  return { value: auction.id, label: `${formatDayMonthYear(auction.saleDate)} · ${auction.title}${status}` }
}

type CatalogueFormProps = {
  mode: 'create' | 'edit'
  initialValues: CatalogueFormValues
  auctions: readonly AuctionWithCatalogues[]
  /** Where Cancel goes */
  cancelTo: string
}

/** Creates or edits a catalogue entry: its sale, lot range and the auction house's PDF link. */
export function CatalogueForm({ mode, initialValues, auctions, cancelTo }: CatalogueFormProps): React.JSX.Element {
  const navigate = useNavigate()
  const form = useValidatedForm({
    initialValues,
    validate: (values: CatalogueFormValues) => validateCatalogueForm(values, { mode, auctions }),
    onSubmit: handleSave,
  })
  const { values, errors, setField } = form
  const selectedAuction = auctions.find((auction) => auction.id === values.auctionId)

  async function handleSave(input: CatalogueFormInput): Promise<FormErrors<CatalogueFormValues> | null> {
    try {
      if (mode === 'create') {
        await createCatalogue({ id: input.id, ...input.fields })
      } else {
        await updateCatalogue(initialValues.id, input.fields)
      }
      navigate(adminAuctionPath(input.fields.auctionId), {
        state: flashState(mode === 'create' ? `Catalogue “${input.fields.title}” added.` : `Catalogue “${input.fields.title}” saved.`),
      })
      return null
    } catch (error) {
      return formErrorsFromApi<CatalogueFormValues>(error, formFields, codeFields, pathFields)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function setter(field: keyof CatalogueFormValues): (value: string) => void {
    return (value) => setField(field, value)
  }

  const summaryErrors = toSummaryErrors(errors, fieldIds)
  const suggestedId = suggestCatalogueId(values.title)

  return (
    <div className="admin-form-page">
      <form className="admin-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
        {summaryErrors.length > 0 ? (
          <ErrorSummary key={form.failedSubmits} errors={summaryErrors} subject={mode === 'create' ? 'adding the catalogue' : 'saving the catalogue'} />
        ) : null}

        <fieldset className="form-section">
          <legend className="form-section__legend">The catalogue</legend>
          <SelectField
            id={fieldIds.auctionId}
            label="Sale"
            required
            placeholder="Choose a sale"
            options={auctions.map(auctionOption)}
            value={values.auctionId}
            hint={mode === 'edit' ? 'Moving a catalogue is refused once customers have requested lots from it.' : undefined}
            error={errors.auctionId}
            onChange={setter('auctionId')}
          />
          <TextField id={fieldIds.title} label="Title" required value={values.title} error={errors.title} onChange={setter('title')} />
          <TextAreaField
            id={fieldIds.description}
            label="Description"
            hint="What the catalogue includes, such as condition notes or provenance."
            maxLength={catalogueTextLimits.description}
            value={values.description}
            error={errors.description}
            onChange={setter('description')}
          />
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section__legend">Lots and pages</legend>
          <div className="form-row">
            <TextField
              id={fieldIds.firstLot}
              label="First lot"
              required
              inputMode="numeric"
              className="admin-form__number"
              value={values.firstLot}
              error={errors.firstLot}
              onChange={setter('firstLot')}
            />
            <TextField
              id={fieldIds.lastLot}
              label="Last lot"
              required
              inputMode="numeric"
              className="admin-form__number"
              hint={selectedAuction?.lotCount ? `The sale has ${selectedAuction.lotCount} lots.` : undefined}
              value={values.lastLot}
              error={errors.lastLot}
              onChange={setter('lastLot')}
            />
            <TextField
              id={fieldIds.pageCount}
              label="Pages"
              inputMode="numeric"
              className="admin-form__number"
              value={values.pageCount}
              error={errors.pageCount}
              onChange={setter('pageCount')}
            />
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section__legend">Links</legend>
          <TextField
            id={fieldIds.pdfUrl}
            type="url"
            label="PDF address"
            required
            hint="The auction house's own PDF, starting https://. Customers open it in a new tab."
            value={values.pdfUrl}
            error={errors.pdfUrl}
            onChange={setter('pdfUrl')}
          />
          <div className="form-row">
            <TextField
              id={fieldIds.coverUrl}
              type="url"
              label="Cover image address"
              hint="Optional. Without one, a typeset cover is drawn."
              value={values.coverUrl}
              error={errors.coverUrl}
              onChange={setter('coverUrl')}
            />
            <TextField
              id={fieldIds.coverAlt}
              label="Cover description"
              value={values.coverAlt}
              error={errors.coverAlt}
              onChange={setter('coverAlt')}
            />
          </div>
          {mode === 'create' ? (
            <TextField
              id={fieldIds.id}
              label="Catalogue id"
              hint={
                suggestedId
                  ? `Leave empty to use ${suggestedId}. It can't be changed once the catalogue is added.`
                  : "Lower-case words joined by hyphens. It can't be changed once the catalogue is added."
              }
              value={values.id}
              error={errors.id}
              onChange={setter('id')}
            />
          ) : null}
        </fieldset>

        <div className="admin-form__actions">
          <Button type="submit" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Saving…' : mode === 'create' ? 'Add catalogue' : 'Save changes'}
          </Button>
          <ButtonLink to={cancelTo} variant="secondary">
            Cancel
          </ButtonLink>
        </div>
      </form>

      {mode === 'edit' ? <DeleteCatalogue catalogueId={initialValues.id} title={initialValues.title} auctionId={initialValues.auctionId} /> : null}
    </div>
  )
}

type DeleteCatalogueProps = {
  catalogueId: string
  title: string
  auctionId: string
}

/** Removes a catalogue nobody has requested lots from; the API refuses otherwise and says why. */
function DeleteCatalogue({ catalogueId, title, auctionId }: DeleteCatalogueProps): React.JSX.Element {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await deleteCatalogue(catalogueId)
      navigate(adminAuctionPath(auctionId), { replace: true, state: flashState(`Catalogue “${title}” deleted.`) })
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "We couldn't delete it just now. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <section className="admin-form__danger" aria-labelledby="delete-catalogue-title">
      <h2 id="delete-catalogue-title" className="form-section__legend">
        Delete this catalogue
      </h2>
      <p>Only possible while no customer has requested a lot from it.</p>
      <div>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Delete catalogue
        </Button>
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete this catalogue?"
          confirmLabel="Delete catalogue"
          busy={busy}
          error={error}
          onConfirm={() => void handleDelete()}
          onClose={() => {
            setConfirming(false)
            setError(null)
          }}
        >
          <p>{`“${title}” will be removed for good. This can't be undone.`}</p>
        </ConfirmDialog>
      ) : null}
    </section>
  )
}
