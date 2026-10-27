import { use } from 'react'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import type { SaleStatus } from '../auctions/saleStatus'
import type { CatalogueWithAuction } from '../auctions/types'
import { CatalogueCard } from './CatalogueCard'

type CatalogueResultsProps = {
  catalogues: Promise<readonly CatalogueWithAuction[]>
  status: SaleStatus
}

export function CatalogueResults({ catalogues: cataloguesPromise, status }: CatalogueResultsProps): React.JSX.Element {
  const catalogues = use(cataloguesPromise)

  if (catalogues.length === 0) {
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

  return (
    <>
      <h2 className="page__results-count">
        {`${catalogues.length} ${catalogues.length === 1 ? 'catalogue' : 'catalogues'} for ${status} sales`}
      </h2>
      <div className="catalogue-grid">
        {catalogues.map((catalogue) => (
          <CatalogueCard key={catalogue.id} catalogue={catalogue} auction={catalogue.auction} />
        ))}
      </div>
    </>
  )
}
