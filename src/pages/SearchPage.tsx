import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { searchLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { SearchResults } from '../../taxonomy_search/web/SearchResults'

// Results come from the taxonomy search (taxonomy_search/INTEGRATION.md).
export function SearchPage(): React.JSX.Element {
  const { query, results } = useLoaderData<typeof searchLoader>()
  return (
    <PageContainer eyebrow="Search" title="Search auction lots" description={query ? `Results for “${query}”` : 'Search all lots in French or English using the search box above.'}>
      {results ? <Suspense key={query} fallback={<p role="status">Searching auction lots…</p>}><SearchResults result={results} /></Suspense> : null}
    </PageContainer>
  )
}
