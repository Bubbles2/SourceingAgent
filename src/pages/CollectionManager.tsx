import { useState, type FormEvent } from 'react'
import { PageContainer } from '../components/layout/PageContainer'
import { Button } from '../components/ui/Button'
import { ErrorSummary } from '../components/form/ErrorSummary'
import { FieldShell, describedBy } from '../components/form/FieldShell'
import { Notice } from '../components/ui/Notice'
import { refreshSession } from '../features/auth/sessionStore'
import { ApiError } from '../services/apiClient'
import { createCollection, getRunningJob, getStatus, type CollectionStatus } from '../services/CollectionSetvice'
import './CollectionManager.css'

const fieldId = 'max-auctions'
const jobFieldId = 'collection-job-id'

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
  const [jobId, setJobId] = useState('')
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
      const run = await createCollection(count)
      setJobId(run.id)
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
            The collection service accepted your request for up to {maxAuctions} auctions. Job ID: <strong>{jobId}</strong>.
            Use the Collection status tab to check its progress.
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

/** Administrator-only lookup for the job ID shown after a collection request. */
export function CollectionStatusPage(): React.JSX.Element {
  const [jobId, setJobId] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [run, setRun] = useState<CollectionStatus | null>(null)
  const [noRunningJob, setNoRunningJob] = useState(false)
  const [loadingAction, setLoadingAction] = useState<'status' | 'running' | null>(null)

  async function handleStatus(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (loadingAction) return
    setRun(null)
    setNoRunningJob(false)
    setRequestError('')
    const id = jobId.trim()
    if (!/^[1-9]\d*$/.test(id)) {
      setFieldError('Enter a positive whole-number job ID.')
      return
    }
    setFieldError('')
    setLoadingAction('status')
    try {
      setRun(await getStatus(id))
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'unauthenticated' || error.code === 'forbidden') void refreshSession()
        setRequestError(error.message)
      } else {
        setRequestError('The collection status could not be loaded. Please try again.')
      }
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleRunningJob(): Promise<void> {
    if (loadingAction) return
    setRun(null)
    setNoRunningJob(false)
    setFieldError('')
    setRequestError('')
    setLoadingAction('running')
    try {
      const active = await getRunningJob()
      if (active) {
        setJobId(active.id)
        setRun(active)
      } else {
        setNoRunningJob(true)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'unauthenticated' || error.code === 'forbidden') void refreshSession()
        setRequestError(error.message)
      } else {
        setRequestError('The running job could not be checked. Please try again.')
      }
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <PageContainer eyebrow="Administration" title="Collection status" description="Enter a job ID or find the currently running collection.">
      <form className="collection-manager" noValidate onSubmit={(event) => void handleStatus(event)}>
        {fieldError || requestError ? (
          <ErrorSummary errors={[fieldError ? { fieldId: jobFieldId, message: fieldError } : { message: requestError }]} />
        ) : null}
        <FieldShell id={jobFieldId} label="Job ID" error={fieldError} hint="The number shown when you started the collection.">
          <input
            id={jobFieldId}
            className="field__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={jobId}
            disabled={loadingAction !== null}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy({ id: jobFieldId, hint: 'The number shown when you started the collection.', error: fieldError })}
            onChange={(event) => {
              setJobId(event.target.value)
              setFieldError('')
              setRequestError('')
              setRun(null)
              setNoRunningJob(false)
            }}
          />
        </FieldShell>
        <div className="collection-manager__actions">
          <Button type="submit" disabled={loadingAction !== null}>
            {loadingAction === 'status' ? 'Checking…' : 'Check status'}
          </Button>
          <Button type="button" variant="secondary" disabled={loadingAction !== null} onClick={() => void handleRunningJob()}>
            {loadingAction === 'running' ? 'Checking…' : 'Running job?'}
          </Button>
        </div>
        {noRunningJob ? (
          <Notice tone="info" title="No collection job is running.">
            Enter an earlier job ID to check its last saved status.
          </Notice>
        ) : null}
        {run ? (
          <Notice tone="info" title={`Job ${run.id}: ${run.status}.`}>
            Auctions processed: {run.auctionsProcessed} of {run.auctionsDiscovered}. Lots found: {run.lotsDiscovered}.
            Lots saved: {run.lotsSaved}. Lots failed: {run.lotsFailed}.
          </Notice>
        ) : null}
      </form>
    </PageContainer>
  )
}
