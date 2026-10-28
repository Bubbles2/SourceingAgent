import { use } from 'react'
import { Link } from 'react-router'
import { adminAuctionPath, editAuctionPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { countPages, type Page } from '../../services/pagination'
import { formatSaleDateShort } from '../auctions/formatAuction'
import type { AuctionWithCatalogues } from '../auctions/types'
import type { AdminAuctionView } from './adminAuctionService'
import { AuctionStatusBadge } from './AuctionStatusBadge'
import '../../components/ui/Table.css'
import './AdminTables.css'

const emptyMessages: Record<AdminAuctionView, { title: string; body: string }> = {
  upcoming: { title: 'No upcoming published sales', body: 'Publish a draft, or create a sale, and it appears here.' },
  completed: { title: 'No completed sales yet', body: 'Published sales move here once their sale day is over.' },
  drafts: { title: 'No drafts', body: 'New sales start as drafts, hidden from the website until you publish them.' },
  cancelled: { title: 'No cancelled sales', body: 'Sales you cancel stay here, with their catalogues and requests.' },
}

type AdminAuctionsTableProps = {
  auctions: Promise<Page<AuctionWithCatalogues>>
  view: AdminAuctionView
  page: number
}

export function AdminAuctionsTable({ auctions: auctionsPromise, view, page }: AdminAuctionsTableProps): React.JSX.Element {
  const { items: auctions, total, limit } = use(auctionsPromise)

  if (auctions.length === 0) {
    return (
      <EmptyState
        title={total === 0 ? emptyMessages[view].title : 'No sales on this page'}
        actions={
          total === 0 ? null : (
            <ButtonLink to={{ search: `?view=${view}` }} variant="secondary">
              Go to the first page
            </ButtonLink>
          )
        }
      >
        {total === 0 ? emptyMessages[view].body : 'There are fewer sales than this page number suggests.'}
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">{`${total} ${total === 1 ? 'sale' : 'sales'}`}</h2>
      <div className="table-wrap">
        <table className="table admin-table">
          <caption className="visually-hidden">Sales</caption>
          <thead>
            <tr>
              <th scope="col">Sale</th>
              <th scope="col">Date</th>
              <th scope="col" className="num">
                Catalogues
              </th>
              <th scope="col">Featured</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {auctions.map((auction) => (
              <tr key={auction.id}>
                <td>
                  <Link className="table__primary" to={adminAuctionPath(auction.id)}>
                    {auction.title}
                  </Link>
                  <span className="table__secondary">{`${auction.house} · ${auction.city}`}</span>
                </td>
                <td className="admin-table__date">
                  <span className="table__primary">{formatSaleDateShort(auction.saleDate)}</span>
                  <span className="table__secondary">{auction.saleTime}</span>
                </td>
                <td className="num">{auction.catalogues.length}</td>
                <td>{auction.featured ? 'Yes' : <span className="table__secondary">No</span>}</td>
                <td>
                  <AuctionStatusBadge status={auction.status} />
                </td>
                <td className="admin-table__actions">
                  <ButtonLink to={editAuctionPath(auction.id)} size="sm" variant="secondary" aria-label={`Edit ${auction.title}`}>
                    Edit
                  </ButtonLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        label="Pages of sales"
        page={page}
        pageCount={countPages({ total, limit })}
        pageLink={(target) => ({ search: target > 1 ? `?view=${view}&page=${target}` : `?view=${view}` })}
      />
    </>
  )
}
