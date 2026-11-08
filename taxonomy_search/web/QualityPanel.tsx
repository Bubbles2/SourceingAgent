import { useCallback, useEffect, useState } from 'react'
import { SelectField } from '../../src/components/form/SelectField'
import { Notice } from '../../src/components/ui/Notice'
import '../../src/components/ui/Table.css'
import { errorMessage } from './adminErrors'
import { formatTime, JobPanel, useJob } from './JobPanel'
import { CommandCard } from './MaintainPanel'
import {
  getBenchmark,
  getJobCommands,
  getReport,
  getReports,
  getSearchLog,
  type Benchmark,
  type JobCommand,
  type Metrics,
  type ReportInfo,
  type SearchLog,
} from './searchAdminApi'

const qualityCommands = ['evaluate-search', 'run-regression', 'improve-taxonomy']
const systems: { key: string; label: string }[] = [
  { key: 'hybrid_broad', label: 'Site search (broad)' },
  { key: 'hybrid_exact', label: 'Site search (exact)' },
  { key: 'taxonomy_only', label: 'Taxonomy only' },
  { key: 'keyword_content', label: 'Keywords only' },
  { key: 'semantic_only', label: 'Meaning only' },
]

function cell(value: number | undefined, digits = 3): string {
  return value === undefined || Number.isNaN(value) ? '—' : value.toFixed(digits)
}

function MetricsTable({ benchmark }: { benchmark: Benchmark }): React.JSX.Element {
  const row = (metrics: Metrics | undefined): (number | undefined)[] =>
    [metrics?.precision, metrics?.recall, metrics?.ndcg, metrics?.mrr]
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">System</th>
            <th scope="col" className="num">Precision@10</th>
            <th scope="col" className="num">Recall@50</th>
            <th scope="col" className="num">nDCG@10</th>
            <th scope="col" className="num">MRR</th>
            <th scope="col" className="num">Mean ms</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((system) => {
            const latest = benchmark.latest[system.key]
            const baseline = benchmark.baseline[system.key]
            return (
              <tr key={system.key}>
                <td>
                  <span className="table__primary">{system.label}</span>
                  <span className="table__secondary">baseline</span>
                </td>
                {row(latest).map((value, i) => (
                  <td key={i} className="num">
                    {cell(value)}
                    <span className="table__secondary">{cell(row(baseline)[i])}</span>
                  </td>
                ))}
                <td className="num">
                  {cell(latest?.meanMs, 1)}
                  <span className="table__secondary">{cell(baseline?.meanMs, 1)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Reports(): React.JSX.Element {
  const [reports, setReports] = useState<ReportInfo[]>([])
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getReports().then(setReports).catch((reason: unknown) => setError(errorMessage(reason, 'The reports could not be listed.')))
  }, [])

  function show(next: string): void {
    setName(next)
    setContent('')
    if (!next) return
    getReport(next).then(setContent).catch((reason: unknown) => setError(errorMessage(reason, 'The report could not be loaded.')))
  }

  return (
    <section className="sa-section" aria-labelledby="sa-reports-title">
      <h2 id="sa-reports-title" className="sa-section__title">Reports</h2>
      <SelectField id="sa-report" label="Report" value={name} placeholder="Choose a report"
        options={reports.map((r) => ({ value: r.name, label: `${r.title} (${formatTime(new Date(r.modified * 1000).toISOString())})` }))}
        onChange={show} />
      {error ? <p role="alert" className="sa-error">{error}</p> : null}
      {content ? <pre className="sa-log sa-report" tabIndex={0} aria-label="Report">{content}</pre> : null}
    </section>
  )
}

export function QualityPanel(): React.JSX.Element {
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null)
  const [log, setLog] = useState<SearchLog | null>(null)
  const [commands, setCommands] = useState<JobCommand[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    Promise.all([getBenchmark(), getSearchLog()])
      .then(([nextBenchmark, nextLog]) => { setBenchmark(nextBenchmark); setLog(nextLog) })
      .catch((reason: unknown) => setError(errorMessage(reason, 'The quality figures could not be loaded.')))
  }, [])
  const { job, error: jobError, starting, start, follow } = useJob(refresh)

  useEffect(() => {
    refresh()
    getJobCommands().then(setCommands).catch((reason: unknown) => setError(errorMessage(reason, 'The commands could not be loaded.')))
  }, [refresh])

  return (
    <div className="sa-panel">
      {error ? <p role="alert" className="sa-error">{error}</p> : null}
      <section className="sa-section" aria-labelledby="sa-metrics-title">
        <h2 id="sa-metrics-title" className="sa-section__title">Search quality</h2>
        <p className="sa-section__intro">
          Latest evaluation on 20 benchmark queries, with the saved baseline below each figure. The regression check
          fails when the site search falls more than 0.05 below the baseline.
        </p>
        {benchmark ? (
          <>
            <MetricsTable benchmark={benchmark} />
            {benchmark.humanLabels === 0 ? (
              <Notice tone="gold" title="Provisional figures.">
                The benchmark's relevance labels are rules, not human judgements. Fill in data/benchmark/human_labels.csv
                in taxonomy_search for trustworthy figures.
              </Notice>
            ) : <p className="sa-muted">{benchmark.humanLabels} human relevance labels applied.</p>}
          </>
        ) : <p className="sa-muted">Loading…</p>}
      </section>

      <section className="sa-section" aria-labelledby="sa-quality-run-title">
        <h2 id="sa-quality-run-title" className="sa-section__title">Run</h2>
        <p className="sa-section__intro">
          Proposed improvements are saved as candidates of a draft version; review them on the Review tab. Nothing is
          approved or published automatically.
        </p>
        <div className="sa-actions">
          {commands.filter((c) => qualityCommands.includes(c.command)).map((command) => (
            <CommandCard key={command.command} command={command} disabled={starting || job?.status === 'running'}
              onStart={(options) => void start(command.command, options)} />
          ))}
        </div>
        {jobError ? <p role="alert" className="sa-error">{jobError}</p> : null}
        {job ? <JobPanel job={job} onCancelled={follow} /> : null}
      </section>

      <section className="sa-section" aria-labelledby="sa-log-title">
        <h2 id="sa-log-title" className="sa-section__title">What people search for</h2>
        {log ? (
          <>
            <p className="sa-muted">
              Words not understood (most searched first): {log.unresolved.slice(0, 20).map((u) => `${u.term} (${u.searches})`).join(', ') || 'none'}
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Search</th>
                    <th scope="col">Mode</th>
                    <th scope="col" className="num">Direct</th>
                    <th scope="col" className="num">All</th>
                    <th scope="col" className="num">ms</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {log.recent.map((r) => (
                    <tr key={`${r.createdAt}-${r.query}`}>
                      <td>
                        <span className="table__primary">{r.query}</span>
                        {r.unresolvedTerms.length > 0 ? <span className="table__secondary">not understood: {r.unresolvedTerms.join(', ')}</span> : null}
                      </td>
                      <td>{r.mode}</td>
                      <td className="num">{r.directResults}</td>
                      <td className="num">{r.results}</td>
                      <td className="num">{r.tookMs}</td>
                      <td>{formatTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="sa-muted">Loading…</p>}
      </section>

      <Reports />
    </div>
  )
}
