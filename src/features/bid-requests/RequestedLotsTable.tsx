import { use } from 'react'
import { Link } from 'react-router'
import { auctionPath, paths } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatSaleDateShort } from '../auctions/formatAuction'
import { AvailabilityBadge } from './AvailabilityBadge'
import type { RequestedLot } from './types'
import '../../components/ui/Table.css'

type RequestedLotsTableProps = {
  lots: Promise<readonly RequestedLot[]>
}

export function RequestedLotsTable({ lots: lotsPromise }: RequestedLotsTableProps): React.JSX.Element {
  const lots = use(lotsPromise)

  if (lots.length === 0) {
    return (
      <EmptyState title="No lots are reserved yet" actions={<ButtonLink to={paths.requestBid}>Request a bid</ButtonLink>}>
        Lots appear here once the agent accepts a bid request for them.
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">{`${lots.length} requested ${lots.length === 1 ? 'lot' : 'lots'}`}</h2>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">Lots with an accepted bid request, soonest sale first</caption>
          <thead>
            <tr>
              <th scope="col">Auction</th>
              <th scope="col">Catalogue</th>
              <th scope="col" className="num">
                Lot
              </th>
              <th scope="col">Availability</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={`${lot.catalogue.id}-${lot.lotNumber}`}>
                <td>
                  <Link className="table__primary" to={auctionPath(lot.auction.id)}>
                    {lot.auction.title}
                  </Link>
                  <span className="table__secondary">{`${formatSaleDateShort(lot.auction.saleDate)} · ${lot.auction.house}`}</span>
                </td>
                <td>{lot.catalogue.title}</td>
                <td className="num">{lot.lotNumber}</td>
                <td>
                  <AvailabilityBadge availability={lot.availability} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
