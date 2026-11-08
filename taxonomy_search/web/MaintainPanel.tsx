import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../src/components/ui/Button'
import { Notice } from '../../src/components/ui/Notice'
import '../../src/components/ui/Table.css'
import { errorMessage } from './adminErrors'
import { formatTime, JobPanel, JobStatusBadge, useJob } from './JobPanel'
import { getJobCommands, getJobs, getStatus, type Job, type JobCommand, type SearchStatus } from './searchAdminApi'

// Commands shown here; publication and quality jobs live on their own tabs.
const maintenanceCommands = ['maintain', 'build-search-index', 'classify-lots', 'build-embeddings', 'build-taxonomy']

// Options that redo everything or change data are confirmed first.
const confirmations: Record<string, string> = {
  force: 'Redo every lot, not only new or changed ones? This can take several minutes.',
}

const optionLabels: Record<string, string> = {
  force: 'All lots (force)',
  affected: 'Only lots affected by taxonomy changes',
  dry_run: 'Dry run (write nothing)',
  extract: 'Also extract candidates from new lots',
  save_baseline: 'Save the result as the new baseline',
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}% of ${whole.toLocaleString('en-GB')} lots` : '—'
}

function StatusCards({ status }: { status: SearchStatus }): React.JSX.Element {
  const lots = status.collector.lots
  const cards = [
    { label: 'Collector lots', value: lots, note: `${status.collector.auctions} sales · last collected ${formatTime(status.collector.lastCollected)}` },
    { label: 'Indexed', value: status.index.lots, note: `${percent(status.index.lots, lots)} · ${formatTime(status.index.lastRun)}` },
    { label: 'Classified', value: status.classification.lots, note: `${status.classification.flagged.toLocaleString('en-GB')} flagged for review` },
    { label: 'Embedded', value: status.embeddings.lots, note: `${percent(status.embeddings.lots, lots)} · ${formatTime(status.embeddings.lastRun)}` },
    { label: 'Taxonomy', value: status.concepts, note: status.publishedVersion ? `published version ${status.publishedVersion}` : 'draft (nothing published yet)' },
    { label: 'Searches logged', value: status.searches, note: 'used to propose improvements' },
  ]
  return (
    <div className="sa-cards">
      {cards.map((card) => (
        <div key={card.label} className="sa-card">
          <p className="sa-card__label">{card.label}</p>
          <p className="sa-card__value">{card.value.toLocaleString('en-GB')}</p>
          <p className="sa-card__note">{card.note}</p>
        </div>
      ))}
    </div>
  )
}

export function CommandCard({ command, disabled, onStart }: { command: JobCommand; disabled: boolean; onStart: (options: Record<string, boolean>) => void }): React.JSX.Element {
  const [options, setOptions] = useState<Record<string, boolean>>({})

  function handleStart(): void {
    const confirmText = Object.entries(options).find(([key, on]) => on && confirmations[key])?.[0]
    if (confirmText && !window.confirm(confirmations[confirmText])) return
    onStart(options)
  }

  return (
    <div className="sa-action">
      <h3 className="sa-action__title">{command.label}</h3>
      <p className="sa-action__text">{command.description}</p>
      {command.options.length > 0 ? (
        <div className="sa-action__options">
          {command.options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                className="sa-checkbox"
                checked={options[option] ?? false}
                onChange={(event) => setOptions((current) => ({ ...current, [option]: event.target.checked }))}
              />
              {optionLabels[option] ?? option}
            </label>
          ))}
        </div>
      ) : null}
      <Button variant={command.command === 'maintain' ? 'primary' : 'secondary'} size="sm" disabled={disabled} onClick={handleStart}>
        Run
      </Button>
    </div>
  )
}

export function MaintainPanel(): React.JSX.Element {
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const [commands, setCommands] = useState<JobCommand[]>([])
  const [history, setHistory] = useState<Job[]>([])
  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(() => {
    Promise.all([getStatus(), getJobs()])
      .then(([nextStatus, jobs]) => {
        setStatus(nextStatus)
        setHistory(jobs.jobs)
        setLoadError('')
      })
      .catch((reason: unknown) => setLoadError(errorMessage(reason, 'The search status could not be loaded.')))
  }, [])

  const { job, error, starting, start, follow } = useJob(refresh)

  useEffect(() => {
    refresh()
    getJobCommands()
      .then(setCommands)
      .catch((reason: unknown) => setLoadError(errorMessage(reason, 'The commands could not be loaded.')))
  }, [refresh])

  useEffect(() => {
    if (status?.runningJob && !job) follow(status.runningJob)
  }, [status, job, follow])

  const running = job?.status === 'running'

  return (
    <div className="sa-panel">
      {loadError ? <p role="alert" className="sa-error">{loadError}</p> : null}
      <section className="sa-section" aria-labelledby="sa-status-title">
        <h2 id="sa-status-title" className="sa-section__title">Status</h2>
        {status ? <StatusCards status={status} /> : <p className="sa-muted">Loading…</p>}
        {status && status.taxonomyScope === 'draft' ? (
          <Notice tone="info" title="Draft taxonomy.">
            No version is published yet, so search uses the reviewed seed plus approved concepts. Publish a version on the Review tab.
          </Notice>
        ) : null}
      </section>

      <section className="sa-section" aria-labelledby="sa-run-title">
        <h2 id="sa-run-title" className="sa-section__title">Run</h2>
        <p className="sa-section__intro">
          After a collection run, use <strong>Maintain</strong>: it indexes new lots, classifies what changed, embeds new lots
          and checks that search quality has not dropped. One job runs at a time.
        </p>
        <div className="sa-actions">
          {commands
            .filter((command) => maintenanceCommands.includes(command.command))
            .map((command) => (
              <CommandCard key={command.command} command={command} disabled={starting || running} onStart={(options) => void start(command.command, options)} />
            ))}
        </div>
        {error ? <p role="alert" className="sa-error">{error}</p> : null}
        {job ? <JobPanel job={job} onCancelled={follow} /> : null}
      </section>

      <section className="sa-section" aria-labelledby="sa-history-title">
        <h2 id="sa-history-title" className="sa-section__title">Recent jobs</h2>
        {history.length === 0 ? (
          <p className="sa-muted">No jobs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Started</th>
                  <th scope="col">Ended</th>
                  <th scope="col">Result</th>
                  <th scope="col"><span className="visually-hidden">Log</span></th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="table__primary">{item.label}</span>
                      <span className="table__secondary sa-key">{item.command}</span>
                    </td>
                    <td>{formatTime(item.startedAt)}</td>
                    <td>{formatTime(item.finishedAt)}</td>
                    <td><JobStatusBadge status={item.status} /></td>
                    <td>
                      <Button variant="link" size="sm" onClick={() => follow(item)}>
                        Show log
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
