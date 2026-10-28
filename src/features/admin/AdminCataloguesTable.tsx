import { use } from 'react'
import { Link } from 'react-router'
import { adminAuctionPath, editCataloguePath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { countPages, type Page } from '../../services/pagination'
import { formatSaleDateShort } from '../auctions/formatAuction'
import type { SaleStatus } from '../auctions/saleStatus'
import type { CatalogueWithAuction } from '../auctions/types'
import { PdfLink } from '../catalogues/PdfLink'
import '../../components/ui/Table.css'
import './AdminTables.css'

type AdminCataloguesTableProps = {
  catalogues: Promise<Page<CatalogueWithAuction>>
  period: SaleStatus
  page: number
}

/** Catalogues of every sale, published or not, with their PDF links */
export function AdminCataloguesTable({ catalogues: cataloguesPromise, period, page }: AdminCataloguesTableProps): React.JSX.Element {
  const { items: catalogues, total, limit } = use(cataloguesPromise)

  if (catalogues.length === 0) {
    return (
      <EmptyState
        title={total === 0 ? `No catalogues for ${period} sales` : 'No catalogues on this page'}
        actions={
          total === 0 ? null : (
            <ButtonLink to={{ search: `?period=${period}` }} variant="secondary">
              Go to the first page
            </ButtonLink>
          )
        }
      >
        {total === 0 ? 'Add a catalogue from its sale, or with Add catalogue above.' : 'There are fewer catalogues than this page number suggests.'}
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">{`${total} ${total === 1 ? 'catalogue' : 'catalogues'}`}</h2>
      <div className="table-wrap">
        <table className="table admin-table">
          <caption className="visually-hidden">{`Catalogues for ${period} sales`}</caption>
          <thead>
            <tr>
              <th scope="col">Catalogue</th>
              <th scope="col">Sale</th>
              <th scope="col" className="num">
                Lots
              </th>
              <th scope="col">PDF</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {catalogues.map((catalogue) => (
              <tr key={catalogue.id}>
                <td>
                  <span className="table__primary">{catalogue.title}</span>
                  <span className="table__secondary">
                    {catalogue.pageCount === null ? catalogue.id : `${catalogue.id} · ${catalogue.pageCount} pages`}
                  </span>
                </td>
                <td>
                  <Link className="table__primary" to={adminAuctionPath(catalogue.auction.id)}>
                    {catalogue.auction.title}
                  </Link>
                  <span className="table__secondary">{`${formatSaleDateShort(catalogue.auction.saleDate)} · ${catalogue.auction.house}`}</span>
                </td>
                <td className="num">{`${catalogue.lots.first}–${catalogue.lots.last}`}</td>
                <td>
                  <PdfLink href={catalogue.pdfUrl} label="Open PDF" context={catalogue.title} />
                </td>
                <td className="admin-table__actions">
                  <ButtonLink to={editCataloguePath(catalogue.id)} size="sm" variant="secondary" aria-label={`Edit ${catalogue.title}`}>
                    Edit
                  </ButtonLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        label="Pages of catalogues"
        page={page}
        pageCount={countPages({ total, limit })}
        pageLink={(target) => ({ search: target > 1 ? `?period=${period}&page=${target}` : `?period=${period}` })}
      />
    </>
  )
}
