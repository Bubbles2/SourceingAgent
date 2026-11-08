import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, Clock, LoaderCircle, Ban } from 'lucide-react'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { errorMessage } from './adminErrors'
import { cancelJob, getJob, startJob, type Job, type JobStatus } from './searchAdminApi'

const statusIcons: Record<JobStatus, typeof Clock> = {
  running: LoaderCircle,
  succeeded: CircleCheck,
  failed: CircleX,
  cancelled: Ban,
  interrupted: CircleX,
}

const statusText: Record<JobStatus, string> = {
  running: 'Running',
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
}

export function JobStatusBadge({ status }: { status: JobStatus }): React.JSX.Element {
  const Icon = statusIcons[status]
  return (
    <Badge className={`sa-job-status sa-job-status--${status}`}>
      <Icon size={14} />
      {statusText[status]}
    </Badge>
  )
}

export function formatTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Start jobs and follow the current one: polled every 2 s while it runs. */
export function useJob(onFinished?: (job: Job) => void): {
  job: Job | null
  error: string
  starting: boolean
  start: (command: string, options?: Record<string, boolean | string>) => Promise<void>
  follow: (job: Job) => void
} {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const finished = useRef(onFinished)
  finished.current = onFinished

  useEffect(() => {
    if (!job || job.status !== 'running') return undefined
    const timer = window.setTimeout(() => {
      getJob(job.id)
        .then((next) => {
          setJob(next)
          if (next.status !== 'running') finished.current?.(next)
        })
        .catch((reason: unknown) => setError(errorMessage(reason, 'The job status could not be loaded.')))
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [job])

  const start = useCallback(async (command: string, options: Record<string, boolean | string> = {}) => {
    setError('')
    setStarting(true)
    try {
      setJob(await startJob(command, options))
    } catch (reason) {
      setError(errorMessage(reason, 'The job could not be started.'))
    } finally {
      setStarting(false)
    }
  }, [])

  const follow = useCallback((next: Job) => {
    setError('')
    getJob(next.id)
      .then(setJob)
      .catch((reason: unknown) => setError(errorMessage(reason, 'The job could not be loaded.')))
  }, [])

  return { job, error, starting, start, follow }
}

/** The current job: status, times and the end of its log. */
export function JobPanel({ job, onCancelled }: { job: Job; onCancelled?: (job: Job) => void }): React.JSX.Element {
  const [cancelError, setCancelError] = useState('')
  const logRef = useRef<HTMLPreElement>(null)

  // The log follows its last lines, where the progress and the result are.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [job.log])
  const options = Object.entries(job.options)
    .filter(([, value]) => value !== false)
    .map(([key, value]) => (value === true ? key.replace('_', ' ') : `${key} ${value}`))

  async function handleCancel(): Promise<void> {
    setCancelError('')
    try {
      onCancelled?.(await cancelJob(job.id))
    } catch (reason) {
      setCancelError(errorMessage(reason, 'The job could not be cancelled.'))
    }
  }

  return (
    <section className="sa-job" aria-live="polite" aria-label={`Job: ${job.label}`}>
      <div className="sa-job__head">
        <div>
          <h3 className="sa-job__title">
            {job.label}
            {options.length > 0 ? <span className="sa-job__options"> ({options.join(', ')})</span> : null}
          </h3>
          <p className="sa-muted">
            Started {formatTime(job.startedAt)}
            {job.finishedAt ? ` · ended ${formatTime(job.finishedAt)}` : ''}
            {job.exitCode !== null && job.exitCode !== 0 ? ` · exit code ${job.exitCode}` : ''}
          </p>
        </div>
        <div className="sa-job__actions">
          <JobStatusBadge status={job.status} />
          {job.status === 'running' ? (
            <Button variant="secondary" size="sm" onClick={() => void handleCancel()}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      {cancelError ? <p role="alert" className="sa-error">{cancelError}</p> : null}
      <pre ref={logRef} className="sa-log" tabIndex={0} aria-label="Job log">
        {job.log?.trim() || (job.status === 'running' ? 'Waiting for output…' : 'No output.')}
      </pre>
    </section>
  )
}
