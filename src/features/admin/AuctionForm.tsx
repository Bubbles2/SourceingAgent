import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { adminAuctionPath } from '../../app/paths'
import { CheckboxField } from '../../components/form/CheckboxField'
import { ErrorSummary } from '../../components/form/ErrorSummary'
import { SelectField } from '../../components/form/SelectField'
import { TextAreaField } from '../../components/form/TextAreaField'
import { TextField } from '../../components/form/TextField'
import { toSummaryErrors, useValidatedForm, type FormErrors } from '../../components/form/useValidatedForm'
import { Button, ButtonLink } from '../../components/ui/Button'
import { formErrorsFromApi } from '../auth/apiFormErrors'
import { createAuction, updateAuction } from './adminAuctionService'
import {
  auctionTextLimits,
  suggestAuctionId,
  validateAuctionForm,
  type AuctionFormInput,
  type AuctionFormValues,
} from './auctionFormRules'
import { flashState } from './flash'
import './AdminForm.css'

const fieldIds: Record<keyof AuctionFormValues, string> = {
  title: 'auction-title',
  category: 'auction-category',
  house: 'auction-house',
  city: 'auction-city',
  saleDate: 'auction-sale-date',
  saleTime: 'auction-sale-time',
  viewingStart: 'auction-viewing-start',
  viewingEnd: 'auction-viewing-end',
  lotCount: 'auction-lot-count',
  description: 'auction-description',
  imageUrl: 'auction-image-url',
  imageAlt: 'auction-image-alt',
  featured: 'auction-featured',
  status: 'auction-status',
  id: 'auction-id',
}

const formFields = Object.keys(fieldIds) as (keyof AuctionFormValues)[]

// API problems that belong to one field, and API paths that don't match a field's name
const codeFields: Partial<Record<string, keyof AuctionFormValues>> = {
  auction_exists: 'id',
  catalogue_lots_exceed_count: 'lotCount',
}
const pathFields: Partial<Record<string, keyof AuctionFormValues>> = {
  'body.viewing': 'viewingStart',
  'body.viewing.start': 'viewingStart',
  'body.viewing.end': 'viewingEnd',
  'body.image': 'imageUrl',
  'body.image.src': 'imageUrl',
  'body.image.alt': 'imageAlt',
}

const statusOptions = [
  { value: 'draft', label: 'Draft: only administrators can see it' },
  { value: 'published', label: 'Published: on the website for everyone' },
]

type AuctionFormProps = {
  mode: 'create' | 'edit'
  initialValues: AuctionFormValues
  /** Where Cancel goes */
  cancelTo: string
}

/** Creates a sale, or edits one. Publishing, cancelling and deleting are on the sale's own page. */
export function AuctionForm({ mode, initialValues, cancelTo }: AuctionFormProps): React.JSX.Element {
  const navigate = useNavigate()
  const form = useValidatedForm({
    initialValues,
    validate: (values: AuctionFormValues) => validateAuctionForm(values, { mode, originalSaleDate: initialValues.saleDate }),
    onSubmit: handleSave,
  })
  const { values, errors, setField } = form

  async function handleSave(input: AuctionFormInput): Promise<FormErrors<AuctionFormValues> | null> {
    try {
      if (mode === 'create') {
        const created = await createAuction({ id: input.id, status: input.status, ...input.fields })
        navigate(adminAuctionPath(created.id), { state: flashState('Auction created.') })
      } else {
        await updateAuction(initialValues.id, input.fields)
        navigate(adminAuctionPath(initialValues.id), { state: flashState('Changes saved.') })
      }
      return null
    } catch (error) {
      return formErrorsFromApi<AuctionFormValues>(error, formFields, codeFields, pathFields)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void form.submit()
  }

  function textSetter(field: Exclude<keyof AuctionFormValues, 'featured' | 'status'>): (value: string) => void {
    return (value) => setField(field, value)
  }

  function handleStatusChange(value: string): void {
    setField('status', value === 'published' ? 'published' : 'draft')
  }

  const summaryErrors = toSummaryErrors(errors, fieldIds)
  const suggestedId = suggestAuctionId(values.title, values.saleDate)

  return (
    <form className="admin-form" noValidate aria-busy={form.isSubmitting} onSubmit={handleSubmit}>
      {summaryErrors.length > 0 ? (
        <ErrorSummary key={form.failedSubmits} errors={summaryErrors} subject={mode === 'create' ? 'creating the auction' : 'saving the auction'} />
      ) : null}

      <fieldset className="form-section">
        <legend className="form-section__legend">The sale</legend>
        <TextField id={fieldIds.title} label="Title" required value={values.title} error={errors.title} onChange={textSetter('title')} />
        <div className="form-row">
          <TextField
            id={fieldIds.category}
            label="Category"
            required
            hint="Shown on the date strip, such as Fine art."
            value={values.category}
            error={errors.category}
            onChange={textSetter('category')}
          />
          <TextField id={fieldIds.house} label="Auction house" required value={values.house} error={errors.house} onChange={textSetter('house')} />
        </div>
        <TextField
          id={fieldIds.city}
          label="City or district"
          required
          hint="Such as Paris 9e or Bordeaux."
          value={values.city}
          error={errors.city}
          onChange={textSetter('city')}
        />
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">When</legend>
        <div className="form-row">
          <TextField
            id={fieldIds.saleDate}
            type="date"
            label="Sale date"
            required
            value={values.saleDate}
            error={errors.saleDate}
            onChange={textSetter('saleDate')}
          />
          <TextField
            id={fieldIds.saleTime}
            type="time"
            label="Sale time"
            required
            hint="Paris time, 24-hour clock."
            value={values.saleTime}
            error={errors.saleTime}
            onChange={textSetter('saleTime')}
          />
        </div>
        <div className="form-row">
          <TextField
            id={fieldIds.viewingStart}
            type="date"
            label="Viewing from"
            hint="Leave both viewing days empty if not announced yet."
            value={values.viewingStart}
            error={errors.viewingStart}
            onChange={textSetter('viewingStart')}
          />
          <TextField
            id={fieldIds.viewingEnd}
            type="date"
            label="Viewing until"
            value={values.viewingEnd}
            error={errors.viewingEnd}
            onChange={textSetter('viewingEnd')}
          />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Details</legend>
        <TextField
          id={fieldIds.lotCount}
          label="Number of lots"
          inputMode="numeric"
          hint="Leave empty until the catalogue is out."
          className="admin-form__number"
          value={values.lotCount}
          error={errors.lotCount}
          onChange={textSetter('lotCount')}
        />
        <TextAreaField
          id={fieldIds.description}
          label="Description"
          required
          maxLength={auctionTextLimits.description}
          value={values.description}
          error={errors.description}
          onChange={textSetter('description')}
        />
        <div className="form-row">
          <TextField
            id={fieldIds.imageUrl}
            type="url"
            label="Image address"
            hint="A lot photo from the house: an https:// link or a path on this site."
            value={values.imageUrl}
            error={errors.imageUrl}
            onChange={textSetter('imageUrl')}
          />
          <TextField
            id={fieldIds.imageAlt}
            label="Image description"
            hint="What the photo shows, for people who can't see it."
            value={values.imageAlt}
            error={errors.imageAlt}
            onChange={textSetter('imageAlt')}
          />
        </div>
        <CheckboxField id={fieldIds.featured} checked={values.featured} onChange={(checked) => setField('featured', checked)}>
          Feature on the home page
        </CheckboxField>
      </fieldset>

      {mode === 'create' ? (
        <fieldset className="form-section">
          <legend className="form-section__legend">Publishing</legend>
          <SelectField
            id={fieldIds.status}
            label="Status"
            required
            placeholder="Choose a status"
            options={statusOptions}
            value={values.status}
            error={errors.status}
            onChange={handleStatusChange}
          />
          <TextField
            id={fieldIds.id}
            label="Web address"
            hint={
              suggestedId
                ? `Leave empty to use /auctions/${suggestedId}. It can't be changed once the sale is created.`
                : "Lower-case words joined by hyphens. It can't be changed once the sale is created."
            }
            value={values.id}
            error={errors.id}
            onChange={textSetter('id')}
          />
        </fieldset>
      ) : null}

      <div className="admin-form__actions">
        <Button type="submit" disabled={form.isSubmitting}>
          {form.isSubmitting ? 'Saving…' : mode === 'create' ? 'Create auction' : 'Save changes'}
        </Button>
        <ButtonLink to={cancelTo} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  )
}
