import { use, type ReactNode } from 'react'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { countPages, type Page } from '../../services/pagination'
import { LotCard } from './LotCard'
import type { LotWithAuction } from './types'
import './LotCard.css'

type LotResultsProps = {
  lots: Promise<Page<LotWithAuction>>
  page: number
  /** The search for another page of the same list, e.g. "?status=upcoming&page=2" */
  pageSearch: (page: number) => string
  /** Where the lots are from, for the count and page links, e.g. "in upcoming sales" */
  scope: string
  /** Shown when there are no lots at all */
  empty: ReactNode
  /** Show each lot's sale; off on the sale's own page */
  showAuction?: boolean
}

export function LotResults({
  lots: lotsPromise,
  page,
  pageSearch,
  scope,
  empty,
  showAuction = true,
}: LotResultsProps): React.JSX.Element {
  const { items: lots, total, limit } = use(lotsPromise)

  if (total === 0) {
    return <>{empty}</>
  }

  if (lots.length === 0) {
    return (
      <EmptyState
        title="No lots on this page"
        actions={
          <ButtonLink to={{ search: pageSearch(1) }} variant="secondary">
            Go to the first page
          </ButtonLink>
        }
      >
        {`There are fewer lots ${scope} than this page number suggests.`}
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">{`${total.toLocaleString('en-GB')} ${total === 1 ? 'lot' : 'lots'} ${scope}`}</h2>
      <div className="lot-grid">
        {lots.map((lot) => (
          <LotCard key={lot.id} lot={lot} auction={lot.auction} showAuction={showAuction} />
        ))}
      </div>
      <Pagination
        label={`Pages of lots ${scope}`}
        page={page}
        pageCount={countPages({ total, limit })}
        pageLink={(target) => ({ search: pageSearch(target) })}
      />
    </>
  )
}
