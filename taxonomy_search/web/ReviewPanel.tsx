import { useCallback, useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { SelectField } from '../../src/components/form/SelectField'
import { TextField } from '../../src/components/form/TextField'
import { Button, ButtonLink } from '../../src/components/ui/Button'
import { Dialog } from '../../src/components/ui/Dialog'
import { Notice } from '../../src/components/ui/Notice'
import '../../src/components/ui/Table.css'
import { errorMessage } from './adminErrors'
import { csvRecords, splitCsv } from './csvChunks'
import { JobPanel, useJob } from './JobPanel'
import {
  addOutcomes,
  checkPublication,
  exportCsvUrl,
  getStatus,
  importCsvChunk,
  listCandidates,
  reviewStatuses,
  sendDecisions,
  type Candidate,
  type CandidateFilters,
  type CandidatePage,
  type Decision,
  type PublishCheck,
  type ReviewOutcome,
  type ReviewStatus,
  type VersionSummary,
} from './searchAdminApi'

const dimensions = ['category', 'subcategory', 'object_type', 'period', 'style', 'region', 'material', 'technique', 'maker']
const statusLabels: Record<ReviewStatus, string> = { candidate: 'To review', approved: 'Approved', rejected: 'Rejected', all: 'All' }
const pageSize = 50

function outcomeText(outcome: ReviewOutcome): string {
  const parts = [
    `${outcome.approved} approved`,
    `${outcome.rejected} rejected`,
    `${outcome.labelsChanged} labels changed`,
    `${outcome.termsUpdated} labels and synonyms updated`,
    `${outcome.relationshipsUpdated} links updated`,
  ]
  return parts.join(', ')
}

function OutcomeDetails({ outcome }: { outcome: ReviewOutcome }): React.JSX.Element {
  return (
    <>
      <p>{outcomeText(outcome)}.</p>
      {outcome.unknownKeys.length > 0 ? <p className="sa-error">Unknown concepts: {outcome.unknownKeys.slice(0, 10).join(', ')}</p> : null}
      {outcome.invalidRows.length > 0 ? <p className="sa-error">Rows ignored: {outcome.invalidRows.slice(0, 10).join('; ')}</p> : null}
    </>
  )
}

/** A change previewed as a dry run, applied only after confirmation. */
type Pending = { title: string; outcome: ReviewOutcome; apply: () => Promise<ReviewOutcome> }

function ConfirmChange({ pending, onClose, onApplied }: { pending: Pending; onClose: () => void; onApplied: (outcome: ReviewOutcome) => void }): React.JSX.Element {
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleApply(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      onApplied(await pending.apply())
    } catch (reason) {
      setError(errorMessage(reason, 'The change could not be saved.'))
      setBusy(false)
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="sa-section__title">{pending.title}</h2>
      <p className="sa-muted">Preview (nothing saved yet):</p>
      <OutcomeDetails outcome={pending.outcome} />
      {error ? <p role="alert" className="sa-error">{error}</p> : null}
      <div className="sa-row">
        <Button disabled={busy} onClick={() => void handleApply()}>{busy ? 'Saving…' : 'Confirm and save'}</Button>
        <form method="dialog"><Button type="submit" variant="secondary">Cancel</Button></form>
      </div>
    </Dialog>
  )
}

function EditLabels({ candidate, onClose, onPreview }: { candidate: Candidate; onClose: () => void; onPreview: (decision: Decision) => void }): React.JSX.Element {
  const titleId = useId()
  const [labelFr, setLabelFr] = useState(candidate.labelFr ?? '')
  const [labelEn, setLabelEn] = useState(candidate.labelEn ?? '')
  const missing = !labelFr.trim() || !labelEn.trim()

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId} className="sa-section__title">Approve with labels</h2>
      <p className="sa-key">{candidate.conceptKey}</p>
      <TextField id="sa-label-fr" label="French label" required value={labelFr} onChange={setLabelFr} />
      <TextField id="sa-label-en" label="English label" required value={labelEn} onChange={setLabelEn} />
      <div className="sa-row">
        <Button disabled={missing} onClick={() => onPreview({ conceptKey: candidate.conceptKey, decision: 'approve', labelFr: labelFr.trim(), labelEn: labelEn.trim() })}>
          Preview approval
        </Button>
        <form method="dialog"><Button type="submit" variant="secondary">Cancel</Button></form>
      </div>
    </Dialog>
  )
}

function CandidatesTable({ page, selected, onToggle, onDecide, onEdit }: {
  page: CandidatePage
  selected: Set<string>
  onToggle: (key: string) => void
  onDecide: (decisions: Decision[], title: string) => void
  onEdit: (candidate: Candidate) => void
}): React.JSX.Element {
  if (page.items.length === 0) return <p className="sa-muted">No concepts match these filters.</p>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Select</span></th>
            <th scope="col">Concept</th>
            <th scope="col">Labels (FR / EN)</th>
            <th scope="col" className="num">Support</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((c) => (
            <tr key={c.conceptKey}>
              <td>
                <input type="checkbox" className="sa-checkbox" aria-label={`Select ${c.conceptKey}`} checked={selected.has(c.conceptKey)} onChange={() => onToggle(c.conceptKey)} />
              </td>
              <td>
                <span className="table__primary sa-key">{c.conceptKey}</span>
                <span className="table__secondary">{c.dimension} · {c.status} · {c.provenance} · {c.version}</span>
                {c.example ? <span className="sa-quote" title={c.example}>“{c.example}”</span> : null}
              </td>
              <td>
                <span className="table__primary">{c.labelFr ?? '—'}</span>
                <span className="table__secondary">{c.labelEn ?? 'no English label'}</span>
                {c.broader ? <span className="table__secondary sa-key">under {c.broader}</span> : null}
              </td>
              <td className="num">
                {c.confidence.toFixed(2)}
                <span className="table__secondary">{c.lots === null ? '—' : `${c.lots} lots`}</span>
              </td>
              <td>
                <div className="sa-table-actions">
                  <Button size="sm" variant="secondary" onClick={() => onDecide([{ conceptKey: c.conceptKey, decision: 'approve' }], `Approve ${c.conceptKey}`)}>Approve</Button>
                  <Button size="sm" variant="secondary" onClick={() => onDecide([{ conceptKey: c.conceptKey, decision: 'reject' }], `Reject ${c.conceptKey}`)}>Reject</Button>
                  <Button size="sm" variant="link" onClick={() => onEdit(c)}>Labels…</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImportFile({ onPreview, onError }: { onPreview: (pending: Pending) => void; onError: (message: string) => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  async function run(pieces: string[], dryRun: boolean): Promise<ReviewOutcome> {
    let total: ReviewOutcome | null = null
    for (const piece of pieces) {
      const outcome = await importCsvChunk(piece, dryRun) // in order: later rows can depend on earlier approvals
      total = total ? addOutcomes(total, outcome) : outcome
    }
    if (!total) throw new Error('empty')
    return total
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const content = await file.text()
      const pieces = splitCsv(content)
      if (pieces.length === 0) {
        onError('The file has no rows to import.')
        return
      }
      const rows = csvRecords(content).length - 1
      onPreview({ title: `Import ${file.name} (${rows} rows)`, outcome: await run(pieces, true), apply: () => run(pieces, false) })
    } catch (reason) {
      onError(errorMessage(reason, 'The file could not be read. Use the exported CSV, saved as CSV.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="btn btn--secondary btn--sm">
      {busy ? 'Reading…' : 'Import review file (CSV)…'}
      <input type="file" accept=".csv,text/csv" className="visually-hidden" disabled={busy} onChange={(event) => void handleFile(event)} />
    </label>
  )
}

function Publish({ versions, onPublished }: { versions: VersionSummary[]; onPublished: () => void }): React.JSX.Element {
  const drafts = versions.filter((v) => v.status === 'draft')
  const [version, setVersion] = useState('')
  const [check, setCheck] = useState<PublishCheck | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const titleId = useId()
  const { job, error: jobError, starting, start, follow } = useJob(onPublished)

  async function handleCheck(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    setCheck(null)
    if (!version) {
      setError('Choose a draft version.')
      return
    }
    try {
      setCheck(await checkPublication(version))
    } catch (reason) {
      setError(errorMessage(reason, 'The version could not be checked.'))
    }
  }

  return (
    <section className="sa-section" aria-labelledby="sa-publish-title">
      <h2 id="sa-publish-title" className="sa-section__title">Publish a version</h2>
      <p className="sa-section__intro">
        Publishing makes the approved concepts of a version the taxonomy that search and classification use. Run
        Maintain afterwards so every lot is classified with it.
      </p>
      <form className="sa-row" noValidate onSubmit={(event) => void handleCheck(event)}>
        <SelectField id="sa-publish-version" label="Draft version" required value={version} placeholder="Choose a version"
          options={drafts.map((v) => ({ value: v.label, label: `${v.label} — ${v.approved} approved, ${v.candidates} to review` }))}
          onChange={(value) => { setVersion(value); setCheck(null) }} />
        <Button type="submit" variant="secondary">Check</Button>
      </form>
      {error ? <p role="alert" className="sa-error">{error}</p> : null}
      {check ? (
        check.canPublish ? (
          <Notice tone="success" title={`Version ${check.version} can be published.`}>
            {check.issues.length > 0 ? `${check.issues.length} warnings.` : 'No problems found.'}{' '}
            <Button size="sm" disabled={starting || job?.status === 'running'} onClick={() => setConfirming(true)}>Publish…</Button>
          </Notice>
        ) : (
          <div role="alert">
            <p className="sa-error">Version {check.version} cannot be published yet:</p>
            <ul>{check.issues.slice(0, 20).map((issue) => <li key={issue.message}>{issue.message}</li>)}</ul>
            {check.issues.length > 20 ? <p className="sa-muted">…and {check.issues.length - 20} more.</p> : null}
          </div>
        )
      ) : null}
      {confirming && check ? (
        <Dialog labelledBy={titleId} onClose={() => setConfirming(false)}>
          <h2 id={titleId} className="sa-section__title">Publish version {check.version}?</h2>
          <p>The currently published version, if any, is retired. Search and classification switch to this version.</p>
          <div className="sa-row">
            <Button onClick={() => { setConfirming(false); void start('publish-taxonomy', { version: check.version }) }}>Publish</Button>
            <form method="dialog"><Button type="submit" variant="secondary">Cancel</Button></form>
          </div>
        </Dialog>
      ) : null}
      {jobError ? <p role="alert" className="sa-error">{jobError}</p> : null}
      {job ? <JobPanel job={job} onCancelled={follow} /> : null}
    </section>
  )
}

export function ReviewPanel(): React.JSX.Element {
  const [filters, setFilters] = useState<CandidateFilters>({ status: 'candidate', dimension: '', version: '', provenance: '', q: '', offset: 0 })
  const [draft, setDraft] = useState(filters)
  const [page, setPage] = useState<CandidatePage | null>(null)
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [editing, setEditing] = useState<Candidate | null>(null)

  const load = useCallback((next: CandidateFilters) => {
    setError('')
    listCandidates(next)
      .then((result) => { setPage(result); setSelected(new Set()) })
      .catch((reason: unknown) => setError(errorMessage(reason, 'The concepts could not be loaded.')))
  }, [])

  const loadVersions = useCallback(() => {
    getStatus().then((status) => setVersions(status.versions)).catch(() => undefined)
  }, [])

  useEffect(() => { load(filters) }, [filters, load])
  useEffect(() => { loadVersions() }, [loadVersions])

  async function preview(decisions: Decision[], title: string): Promise<void> {
    setError('')
    setNotice('')
    try {
      const outcome = await sendDecisions(decisions, true)
      setPending({ title, outcome, apply: () => sendDecisions(decisions, false) })
    } catch (reason) {
      setError(errorMessage(reason, 'The change could not be previewed.'))
    }
  }

  function handleApplied(outcome: ReviewOutcome): void {
    setPending(null)
    setNotice(`Saved: ${outcomeText(outcome)}. Run Maintain so the lots are classified with these changes.`)
    load(filters)
    loadVersions()
  }

  function handleFilter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setFilters({ ...draft, offset: 0 })
  }

  const bulk = (decision: 'approve' | 'reject'): void => {
    const keys = [...selected]
    void preview(keys.map((conceptKey) => ({ conceptKey, decision })), `${decision === 'approve' ? 'Approve' : 'Reject'} ${keys.length} concepts`)
  }

  return (
    <div className="sa-panel">
      <section className="sa-section" aria-labelledby="sa-review-title">
        <h2 id="sa-review-title" className="sa-section__title">Concepts to review</h2>
        <p className="sa-section__intro">
          Approving a concept also approves its labels and the links between approved concepts; rejecting one removes it
          from search. Nothing is deleted. Every change is shown as a preview before it is saved.
        </p>
        <form className="sa-row" noValidate onSubmit={handleFilter}>
          <SelectField id="sa-f-status" label="Status" required value={draft.status} placeholder="Status"
            options={reviewStatuses.map((s) => ({ value: s, label: statusLabels[s] }))}
            onChange={(value) => setDraft({ ...draft, status: (reviewStatuses.find((s) => s === value) ?? 'candidate') })} />
          <SelectField id="sa-f-version" label="Version" value={draft.version} placeholder="All versions"
            options={versions.map((v) => ({ value: v.label, label: `${v.label} (${v.status})` }))} onChange={(value) => setDraft({ ...draft, version: value })} />
          <SelectField id="sa-f-dimension" label="Kind" value={draft.dimension} placeholder="All kinds"
            options={dimensions.map((d) => ({ value: d, label: d.replace('_', ' ') }))} onChange={(value) => setDraft({ ...draft, dimension: value })} />
          <TextField id="sa-f-q" label="Contains" value={draft.q} onChange={(value) => setDraft({ ...draft, q: value })} />
          <Button type="submit" variant="secondary">Show</Button>
        </form>
        <div className="sa-row">
          <Button size="sm" disabled={selected.size === 0} onClick={() => bulk('approve')}>Approve selected ({selected.size})</Button>
          <Button size="sm" variant="secondary" disabled={selected.size === 0} onClick={() => bulk('reject')}>Reject selected</Button>
          <ButtonLink size="sm" variant="secondary" href={exportCsvUrl(filters.status, filters.version)} download>Export CSV</ButtonLink>
          <ImportFile onPreview={setPending} onError={setError} />
        </div>
        {notice ? <Notice tone="success" title="Done.">{notice}</Notice> : null}
        {error ? <p role="alert" className="sa-error">{error}</p> : null}
        {page ? (
          <>
            <p className="sa-muted">
              {page.total.toLocaleString('en-GB')} concepts · showing {page.total === 0 ? 0 : page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)}
            </p>
            <CandidatesTable page={page} selected={selected}
              onToggle={(key) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })}
              onDecide={(decisions, title) => void preview(decisions, title)} onEdit={setEditing} />
            <div className="sa-row">
              <Button size="sm" variant="secondary" disabled={page.offset === 0} onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - pageSize) })}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page.offset + page.items.length >= page.total} onClick={() => setFilters({ ...filters, offset: filters.offset + pageSize })}>Next</Button>
            </div>
          </>
        ) : <p className="sa-muted">Loading…</p>}
      </section>

      <Publish versions={versions} onPublished={() => { loadVersions(); load(filters) }} />

      {editing ? <EditLabels candidate={editing} onClose={() => setEditing(null)} onPreview={(decision) => { setEditing(null); void preview([decision], `Approve ${decision.conceptKey} with new labels`) }} /> : null}
      {pending ? <ConfirmChange pending={pending} onClose={() => setPending(null)} onApplied={handleApplied} /> : null}
    </div>
  )
}
