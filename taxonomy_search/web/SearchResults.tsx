import { use } from 'react'
import { Link } from 'react-router'
import { LotCard } from '../../src/features/lots/LotCard'
import { searchModes, type SearchMode } from './searchAdminApi'
import { isFailure, type SiteSearchHit, type SiteSearchOutcome } from './siteSearch'
import './SearchResults.css'

const modeNames: Record<SearchMode, string> = { exact: 'Exact', broad: 'Broad', exploratory: 'Exploratory' }

function Hits({ hits }: { hits: SiteSearchHit[] }): React.JSX.Element {
  return (
    <div className="lot-grid">
      {hits.map((hit) => (
        <div key={hit.lot.id} className="site-search__hit">
          <LotCard lot={hit.lot} auction={hit.lot.auction} />
          {hit.reasons.length > 0 ? <p className="site-search__why"><span>Why:</span> {hit.reasons.join(' · ')}</p> : null}
        </div>
      ))}
    </div>
  )
}

/** Results of the taxonomy search: lots matching every part of the query, then related suggestions. */
export function SearchResults({ result: resultPromise }: { result: Promise<SiteSearchOutcome> }): React.JSX.Element {
  const result = use(resultPromise)
  if (isFailure(result)) {
    return <p role="alert" className="site-search__unavailable">Search is not available right now: {result.message}</p>
  }
  const understood = result.ideas.map((idea) => (idea.labels.length > 0 ? `${idea.text} (${idea.labels.join(' or ')})` : idea.text))

  return (
    <div className="site-search">
      <div className="site-search__summary">
        {understood.length > 0 ? <p>Understood: {understood.join(' + ')}{result.unresolvedTerms.length > 0 ? `; also looking for “${result.unresolvedTerms.join(' ')}”` : ''}.</p> : null}
        <nav className="site-search__modes" aria-label="Search mode">
          {searchModes.map((mode) => (
            <Link key={mode} to={{ search: new URLSearchParams({ q: result.query, mode }).toString() }} aria-current={result.mode === mode ? 'true' : undefined}>
              {modeNames[mode]}
            </Link>
          ))}
        </nav>
      </div>

      <h2 className="page__results-count">
        {result.totalDirect === 0 ? 'No lots match every part of your search' : `${result.totalDirect.toLocaleString('en-GB')} ${result.totalDirect === 1 ? 'lot matches' : 'lots match'}`}
        {result.direct.length < result.totalDirect ? ` (best ${result.direct.length} shown)` : ''}
      </h2>
      {result.direct.length > 0 ? <Hits hits={result.direct} /> : <p>Try the broad or exploratory search, or different words.</p>}

      {result.related.length > 0 ? (
        <section className="site-search__related" aria-labelledby="site-search-related">
          <h2 id="site-search-related" className="page__results-count">Related suggestions</h2>
          <p className="site-search__note">These match part of your search, or something close to it.</p>
          <Hits hits={result.related} />
        </section>
      ) : null}
    </div>
  )
}
