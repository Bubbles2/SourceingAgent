import { use } from 'react'
import { Link } from 'react-router'
import { auctionPath, paths } from '../../app/paths'
import { StatusBadge } from '../../components/ui/Badge'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatEur } from '../../utils/money'
import { formatDayMonthYear, formatSaleDateShort } from '../auctions/formatAuction'
import { toParisDate } from '../auctions/saleStatus'
import type { MyBidRequest } from './types'
import '../../components/ui/Table.css'
import './MyRequestsTable.css'

type MyRequestsTableProps = {
  requests: Promise<readonly MyBidRequest[]>
}

export function MyRequestsTable({ requests: requestsPromise }: MyRequestsTableProps): React.JSX.Element {
  const requests = use(requestsPromise)

  if (requests.length === 0) {
    return (
      <EmptyState title="No requests yet" actions={<ButtonLink to={paths.requestBid}>Request a bid</ButtonLink>}>
        When you ask the agent to bid on a lot, the request and its status appear here.
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">{`${requests.length} ${requests.length === 1 ? 'request' : 'requests'}, newest first`}</h2>
      <div className="table-wrap">
        <table className="table my-requests-table">
          <caption className="visually-hidden">Your bid requests, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Auction</th>
              <th scope="col">Catalogue</th>
              <th scope="col" className="num">
                Lot
              </th>
              <th scope="col" className="amount">
                Maximum bid
              </th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>
                  <Link className="table__primary" to={auctionPath(request.auction.id)}>
                    {request.auction.title}
                  </Link>
                  <span className="table__secondary">
                    {`${formatSaleDateShort(request.auction.saleDate)} · ${request.auction.house}`}
                  </span>
                </td>
                <td>{request.catalogue.title}</td>
                <td className="num">{request.lotNumber}</td>
                <td className="amount">{formatEur(request.maxBidEur)}</td>
                <td>
                  <StatusBadge status={request.status} />
                </td>
                <td className="my-requests-table__date">
                  <time dateTime={request.submittedAt}>{formatDayMonthYear(toParisDate(request.submittedAt))}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
