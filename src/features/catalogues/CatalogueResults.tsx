import { use } from 'react'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { countPages, type Page } from '../../services/pagination'
import type { SaleStatus } from '../auctions/saleStatus'
import type { CatalogueWithAuction } from '../auctions/types'
import { CatalogueCard } from './CatalogueCard'

type CatalogueResultsProps = {
  catalogues: Promise<Page<CatalogueWithAuction>>
  status: SaleStatus
  page: number
}

function pageSearch(status: SaleStatus, page: number): string {
  return page > 1 ? `?status=${status}&page=${page}` : `?status=${status}`
}

export function CatalogueResults({ catalogues: cataloguesPromise, status, page }: CatalogueResultsProps): React.JSX.Element {
  const { items: catalogues, total, limit } = use(cataloguesPromise)

  if (total === 0) {
    const otherStatus: SaleStatus = status === 'upcoming' ? 'completed' : 'upcoming'
    return (
      <EmptyState
        title={`No catalogues for ${status} sales`}
        actions={
          <ButtonLink to={{ search: `?status=${otherStatus}` }} variant="secondary" preventScrollReset>
            {`Show ${otherStatus} sales`}
          </ButtonLink>
        }
      >
        Catalogues appear here as soon as auction houses publish them.
      </EmptyState>
    )
  }

  if (catalogues.length === 0) {
    return (
      <EmptyState
        title="No catalogues on this page"
        actions={
          <ButtonLink to={{ search: pageSearch(status, 1) }} variant="secondary">
            Go to the first page
          </ButtonLink>
        }
      >
        {`There are fewer catalogues for ${status} sales than this page number suggests.`}
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">
        {`${total} ${total === 1 ? 'catalogue' : 'catalogues'} for ${status} sales`}
      </h2>
      <div className="catalogue-grid">
        {catalogues.map((catalogue) => (
          <CatalogueCard key={catalogue.id} catalogue={catalogue} auction={catalogue.auction} />
        ))}
      </div>
      <Pagination
        label={`Pages of catalogues for ${status} sales`}
        page={page}
        pageCount={countPages({ total, limit })}
        pageLink={(target) => ({ search: pageSearch(status, target) })}
      />
    </>
  )
}
