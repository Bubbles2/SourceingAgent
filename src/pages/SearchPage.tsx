import { Suspense, use } from 'react'
import { useLoaderData } from 'react-router'
import type { searchLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { OutboundLink } from '../components/ui/OutboundLink'
import type { SearchResult } from '../features/search/searchService'
import './SearchPage.css'

export function SearchPage(): React.JSX.Element {
  const { query, results } = useLoaderData<typeof searchLoader>()
  return (
    <PageContainer eyebrow="Search" title="Search auction lots" description={query ? `Results for “${query}”` : 'Search the auction monitor’s catalogues using the search box above.'}>
      {results ? <Suspense fallback={<p role="status">Searching auction lots…</p>}><SearchResults results={results} /></Suspense> : null}
    </PageContainer>
  )
}

function SearchResults({ results: resultsPromise }: { results: Promise<SearchResult[]> }): React.JSX.Element {
  const results = use(resultsPromise)
  if (results.length === 0) return <p>No matching lots found. Try a different search.</p>
  return <>
    <p className="page__results-count">{`${results.length} ${results.length === 1 ? 'lot' : 'lots'} found`}</p>
    <div className="search-results">
      {results.map((result, index) => (
        <article className="search-result" key={`${result.sourceUrl ?? result.title}-${index}`}>
          <div>
            {result.lotNumber ? <p className="search-result__meta">Lot {result.lotNumber}</p> : null}
            <h2>{result.title}</h2>
            <p className="search-result__meta">{[result.date, result.estimate].filter(Boolean).join(' · ')}</p>
            {result.description ? <p className="search-result__description">{result.description}</p> : null}
          </div>
          {result.sourceUrl ? <OutboundLink href={result.sourceUrl} label="View at auction house" context={result.title} /> : null}
        </article>
      ))}
    </div>
  </>
}
