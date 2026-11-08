import { useEffect, useState, type FormEvent } from 'react'
import { SelectField } from '../../src/components/form/SelectField'
import { TextField } from '../../src/components/form/TextField'
import { Button } from '../../src/components/ui/Button'
import { Notice } from '../../src/components/ui/Notice'
import { errorMessage } from './adminErrors'
import {
  getSettings,
  previewCriteria,
  saveSettings,
  searchModes,
  testExternal,
  testSearch,
  type Criteria,
  type ExternalTest,
  type SearchMode,
  type SearchSettings,
  type TestHit,
  type TestSearch,
} from './searchAdminApi'

const modeLabels: Record<SearchMode, string> = {
  exact: 'Exact — same meaning only',
  broad: 'Broad — with sub-types (default)',
  exploratory: 'Exploratory — with related ideas',
}

function readMode(value: string): SearchMode {
  return searchModes.find((mode) => mode === value) ?? 'broad'
}

function CriteriaView({ criteria }: { criteria: Criteria }): React.JSX.Element {
  return (
    <div className="sa-section">
      <p className="sa-muted">
        Taxonomy: {criteria.taxonomyScope}. A lot matches when it contains one keyword of every required idea.
        {criteria.unresolvedTerms.length > 0 ? ` Not in the taxonomy: ${criteria.unresolvedTerms.join(', ')}.` : ''}
      </p>
      <div className="sa-ideas">
        {criteria.ideas.map((idea) => (
          <div key={idea.text} className="sa-idea">
            <p className="sa-idea__head">
              “{idea.text}” — {idea.required ? 'required' : 'optional (ranking only)'} · {idea.dimension}
            </p>
            <p className="sa-idea__words"><strong>FR:</strong> {idea.fr.join(', ') || '—'}</p>
            <p className="sa-idea__words"><strong>EN:</strong> {idea.en.join(', ') || '—'}</p>
            {idea.covered.length > 0 ? <p className="sa-muted">Covered by a shorter keyword: {idea.covered.join(', ')}</p> : null}
          </div>
        ))}
      </div>
      {(['fr', 'en'] as const).map((lang) => (
        <div key={lang}>
          <p className="sa-muted">AND/OR query ({lang}) — paste into any search engine or API that supports AND/OR:</p>
          <pre className="sa-code">{criteria.boolean[lang] || '—'}</pre>
        </div>
      ))}
      <p className="sa-muted">Phrases for search boxes without AND/OR (fr): {criteria.phrases.fr.slice(0, 12).join(' · ') || '—'}</p>
    </div>
  )
}

function Hits({ title, hits }: { title: string; hits: TestHit[] }): React.JSX.Element {
  return (
    <div className="sa-section">
      <h3 className="sa-action__title">{title}</h3>
      {hits.length === 0 ? <p className="sa-muted">None.</p> : (
        <ol className="sa-hits">
          {hits.map((hit) => (
            <li key={hit.lotId} className="sa-hit">
              <p className="sa-hit__title">{hit.title || `Lot ${hit.lotId}`}</p>
              <p className="sa-muted">Lot {hit.lotId}{hit.auctionDate ? ` · ${hit.auctionDate.slice(0, 10)}` : ''}</p>
              <p className="sa-hit__why">{hit.explanation.join('; ')}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function SearchTestView({ result }: { result: TestSearch }): React.JSX.Element {
  return (
    <div className="sa-section">
      <p className="sa-muted">
        Mode {result.mode} · {result.totalDirect} direct and {result.totalRelated} related matches · {result.tookMs} ms
        {result.concepts.length > 0 ? ` · concepts: ${result.concepts.join(', ')}` : ''}
        {result.unresolved.length > 0 ? ` · not understood: ${result.unresolved.join(', ')}` : ''}
      </p>
      <Hits title="Direct matches (first 10)" hits={result.direct} />
      <Hits title="Related suggestions (first 10)" hits={result.related} />
    </div>
  )
}

function ExternalView({ result }: { result: ExternalTest }): React.JSX.Element {
  return (
    <div className="sa-section">
      <p className="sa-muted">{result.requests.length} requests · {result.tookMs} ms. Providers today: the test catalogue and this database (no real external API is connected).</p>
      <ul className="sa-hits">
        {result.requests.map((r) => (
          <li key={`${r.provider}-${r.language}-${r.query}`} className="sa-hit">
            <p className="sa-muted">{r.provider} [{r.language}] · {r.results} results{r.error ? ` · error: ${r.error}` : ''}</p>
            <pre className="sa-code">{r.query}</pre>
          </li>
        ))}
      </ul>
      <p className="sa-muted">
        Direct: {result.direct.map((lot) => `${lot.provider}:${lot.externalId} ${lot.title}`).slice(0, 8).join(' · ') || 'none'}
      </p>
    </div>
  )
}

function SettingsForm(): React.JSX.Element {
  const [settings, setSettings] = useState<SearchSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSettings().then(setSettings).catch((reason: unknown) => setError(errorMessage(reason, 'The settings could not be loaded.')))
  }, [])

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!settings) return
    setSaved(false)
    setError('')
    try {
      setSettings(await saveSettings(settings))
      setSaved(true)
    } catch (reason) {
      setError(errorMessage(reason, 'The settings could not be saved.'))
    }
  }

  return (
    <section className="sa-section" aria-labelledby="sa-settings-title">
      <h2 id="sa-settings-title" className="sa-section__title">Settings</h2>
      {settings ? (
        <form className="sa-row" noValidate onSubmit={(event) => void handleSave(event)}>
          <SelectField id="sa-default-mode" label="Default mode of the site search" required value={settings.defaultMode} placeholder="Mode"
            options={searchModes.map((mode) => ({ value: mode, label: modeLabels[mode] }))}
            onChange={(value) => { setSettings({ ...settings, defaultMode: readMode(value) }); setSaved(false) }} />
          <TextField id="sa-max-requests" label="External requests per provider and language" required inputMode="numeric"
            value={String(settings.externalMaxRequests)}
            onChange={(value) => { const n = Number(value); if (Number.isInteger(n) && n >= 1 && n <= 50) setSettings({ ...settings, externalMaxRequests: n }); setSaved(false) }} />
          <Button type="submit">Save settings</Button>
        </form>
      ) : <p className="sa-muted">Loading…</p>}
      {saved ? <Notice tone="success" title="Saved.">The site search uses this mode from now on.</Notice> : null}
      {error ? <p role="alert" className="sa-error">{error}</p> : null}
    </section>
  )
}

export function ToolsPanel(): React.JSX.Element {
  const [query, setQuery] = useState('Louis XIV furniture')
  const [mode, setMode] = useState<SearchMode>('broad')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [criteria, setCriteria] = useState<Criteria | null>(null)
  const [search, setSearch] = useState<TestSearch | null>(null)
  const [external, setExternal] = useState<ExternalTest | null>(null)

  async function run(kind: 'criteria' | 'search' | 'external'): Promise<void> {
    const q = query.trim()
    if (q.length < 2) {
      setError('Enter at least 2 characters.')
      return
    }
    setError('')
    setBusy(kind)
    try {
      if (kind === 'criteria') setCriteria(await previewCriteria(q, mode))
      if (kind === 'search') setSearch(await testSearch(q, mode))
      if (kind === 'external') setExternal(await testExternal(q, mode, 6))
    } catch (reason) {
      setError(errorMessage(reason, 'The search service did not answer.'))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="sa-panel">
      <section className="sa-section" aria-labelledby="sa-tools-title">
        <h2 id="sa-tools-title" className="sa-section__title">Try a query</h2>
        <p className="sa-section__intro">
          See the keywords the taxonomy builds for a query (usable in any search engine or API), what the site search
          returns, and what is sent to external providers. Tests are not recorded in the search log.
        </p>
        <form className="sa-row" noValidate onSubmit={(event) => { event.preventDefault(); void run('criteria') }}>
          <TextField id="sa-query" label="Query (French or English)" required value={query} onChange={setQuery} />
          <SelectField id="sa-mode" label="Mode" required value={mode} placeholder="Mode"
            options={searchModes.map((m) => ({ value: m, label: modeLabels[m] }))} onChange={(value) => setMode(readMode(value))} />
          <Button type="submit" disabled={busy !== ''}>{busy === 'criteria' ? 'Building…' : 'Show keywords'}</Button>
          <Button variant="secondary" disabled={busy !== ''} onClick={() => void run('search')}>{busy === 'search' ? 'Searching…' : 'Test site search'}</Button>
          <Button variant="secondary" disabled={busy !== ''} onClick={() => void run('external')}>{busy === 'external' ? 'Searching…' : 'Test external search'}</Button>
        </form>
        {error ? <p role="alert" className="sa-error">{error}</p> : null}
        {criteria ? <CriteriaView criteria={criteria} /> : null}
        {search ? <SearchTestView result={search} /> : null}
        {external ? <ExternalView result={external} /> : null}
      </section>
      <SettingsForm />
    </div>
  )
}
