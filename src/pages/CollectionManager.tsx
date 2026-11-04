import { useState, type FormEvent } from 'react'
import { PageContainer } from '../components/layout/PageContainer'
import { Button } from '../components/ui/Button'
import { ErrorSummary } from '../components/form/ErrorSummary'
import { FieldShell, describedBy } from '../components/form/FieldShell'
import { Notice } from '../components/ui/Notice'
import { refreshSession } from '../features/auth/sessionStore'
import { ApiError } from '../services/apiClient'
import { createCollection } from '../services/CollectionSetvice'
import './CollectionManager.css'

const fieldId = 'max-auctions'

function readMaxAuctions(value: string): number | null {
  const trimmed = value.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return null
  const number = Number(trimmed)
  return Number.isSafeInteger(number) ? number : null
}

export function CollectionManager(): React.JSX.Element {
  const [maxAuctions, setMaxAuctions] = useState('20')
  const [fieldError, setFieldError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (isSubmitting) return
    setSubmitted(false)
    setRequestError('')
    const count = readMaxAuctions(maxAuctions)
    if (count === null) {
      setFieldError('Enter a positive whole number of auctions.')
      return
    }
    setFieldError('')
    setIsSubmitting(true)
    try {
      await createCollection(count)
      setSubmitted(true)
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'unauthenticated' || error.code === 'forbidden') void refreshSession()
        const validationError = error.details.find((detail) => detail.path === 'body.maxAuctions')
        if (validationError) setFieldError(validationError.message)
        else setRequestError(error.message)
      } else {
        setRequestError('The collection request could not be submitted. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const error = fieldError || requestError

  return (
    <PageContainer
      eyebrow="Administration"
      title="Collection manager"
      description="Start a collection run with the maximum number of auctions to process."
    >
      <form className="collection-manager" noValidate onSubmit={(event) => void handleSubmit(event)}>
        {error ? (
          <ErrorSummary errors={[fieldError ? { fieldId, message: fieldError } : { message: requestError }]} />
        ) : null}
        {submitted ? (
          <Notice tone="success" title="Collection request submitted.">
            The collection service accepted your request for up to {maxAuctions} auctions.
          </Notice>
        ) : null}
        <FieldShell id={fieldId} label="Maximum auctions" required error={fieldError} hint="Enter a positive whole number.">
          <input
            id={fieldId}
            className="field__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={maxAuctions}
            disabled={isSubmitting}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy({ id: fieldId, hint: 'Enter a positive whole number.', error: fieldError })}
            onChange={(event) => {
              setMaxAuctions(event.target.value)
              setFieldError('')
              setRequestError('')
              setSubmitted(false)
            }}
          />
        </FieldShell>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Start collection'}
        </Button>
      </form>
    </PageContainer>
  )
}
