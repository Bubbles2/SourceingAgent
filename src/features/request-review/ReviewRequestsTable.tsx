import { use, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import { auctionPath } from '../../app/paths'
import { StatusBadge, statusLabel } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { countPages, type Page } from '../../services/pagination'
import { formatEur } from '../../utils/money'
import { formatDayMonthYear, formatSaleDateShort } from '../auctions/formatAuction'
import { toParisDate } from '../auctions/saleStatus'
import { ReviewRequestDialog } from './ReviewRequestDialog'
import { getReviewDetail, type DetailResult } from './reviewService'
import type { ReviewBidRequest, ReviewView } from './types'
import '../../components/ui/Table.css'
import './ReviewRequestsTable.css'

type ReviewRequestsTableProps = {
  requests: Promise<Page<ReviewBidRequest>>
  view: ReviewView
  page: number
}

const emptyMessages: Record<ReviewView, { title: string; body: string }> = {
  pending: { title: 'No requests waiting for review', body: 'New requests from customers appear here.' },
  accepted: { title: 'No accepted requests', body: 'Requests you accept appear here until you record the bid.' },
  placed: { title: 'No bids awaiting a result', body: 'Bids you record as placed appear here until the result is in.' },
  closed: { title: 'No closed requests yet', body: 'Rejected, cancelled, won and lost requests appear here.' },
}

type Selection = {
  request: ReviewBidRequest
  detail: Promise<DetailResult>
}

function viewSearch(view: ReviewView, page: number): string {
  return page > 1 ? `?view=${view}&page=${page}` : `?view=${view}`
}

export function ReviewRequestsTable({ requests: requestsPromise, view, page }: ReviewRequestsTableProps): React.JSX.Element {
  const { items, total, limit } = use(requestsPromise)
  // Requests changed on this page since it loaded; they keep their row until the list is reloaded.
  const [changed, setChanged] = useState<ReadonlyMap<string, ReviewBidRequest>>(new Map())
  const [selection, setSelection] = useState<Selection | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const confirmationRef = useRef<HTMLDivElement>(null)

  function remember(request: ReviewBidRequest): void {
    setChanged((current) => new Map(current).set(request.id, request))
  }

  function loadDetail(request: ReviewBidRequest): Promise<DetailResult> {
    const detail = getReviewDetail(request.id)
    // The dialog may find the request has moved on; keep its row in step.
    void detail.then((result) => {
      if (result.ok) {
        remember(result.detail.request)
      }
    })
    return detail
  }

  function handleReview(request: ReviewBidRequest): void {
    setConfirmation(null)
    setSelection({ request, detail: loadDetail(request) })
  }

  function handleReload(): void {
    setSelection((current) => (current ? { ...current, detail: loadDetail(current.request) } : null))
  }

  function handleDecided(request: ReviewBidRequest): void {
    remember(request)
    // Close the dialog and move focus to the confirmation, so keyboard and screen reader users hear it.
    flushSync(() => {
      setSelection(null)
      setConfirmation(`Lot ${request.lotNumber} in ${request.auction.title} is now marked “${statusLabel(request.status)}”.`)
    })
    confirmationRef.current?.focus()
  }

  function handleClose(): void {
    setSelection(null)
  }

  if (total === 0) {
    return <EmptyState title={emptyMessages[view].title}>{emptyMessages[view].body}</EmptyState>
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No requests on this page"
        actions={
          <ButtonLink to={{ search: viewSearch(view, 1) }} variant="secondary">
            Go to the first page
          </ButtonLink>
        }
      >
        Requests have moved on since this page was loaded.
      </EmptyState>
    )
  }

  const rows = items.map((item) => changed.get(item.id) ?? item)

  return (
    <>
      <h2 className="page__results-count">{`${total} ${total === 1 ? 'request' : 'requests'}`}</h2>
      {confirmation ? (
        <div ref={confirmationRef} tabIndex={-1} className="review-confirmation">
          <Notice tone="success" title="Saved.">
            {confirmation}
          </Notice>
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="table review-table">
          <caption className="visually-hidden">Bid requests to review</caption>
          <thead>
            <tr>
              <th scope="col">Sale</th>
              <th scope="col">Lot</th>
              <th scope="col">Customer</th>
              <th scope="col" className="amount">
                Maximum bid
              </th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((request) => (
              <tr key={request.id}>
                <td>
                  <Link className="table__primary" to={auctionPath(request.auction.id)}>
                    {request.auction.title}
                  </Link>
                  <span className="table__secondary">
                    {`${formatSaleDateShort(request.auction.saleDate)} · ${request.auction.house}`}
                  </span>
                </td>
                <td>
                  <span className="table__primary">{`Lot ${request.lotNumber}`}</span>
                  <span className="table__secondary">{request.catalogue.title}</span>
                </td>
                <td>
                  <span className="table__primary">{`${request.customer.firstName} ${request.customer.lastName}`}</span>
                  <span className="table__secondary">{request.customer.email}</span>
                </td>
                <td className="amount">{formatEur(request.maxBidEur)}</td>
                <td>
                  <StatusBadge status={request.status} />
                  {request.status === 'pending' && request.lotHeldByOther ? (
                    <span className="table__secondary">Lot reserved by another request</span>
                  ) : null}
                </td>
                <td className="review-table__date">
                  <time dateTime={request.submittedAt}>{formatDayMonthYear(toParisDate(request.submittedAt))}</time>
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Review lot ${request.lotNumber} for ${request.customer.firstName} ${request.customer.lastName}`}
                    onClick={() => handleReview(request)}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        label="Pages of requests"
        page={page}
        pageCount={countPages({ total, limit })}
        pageLink={(target) => ({ search: viewSearch(view, target) })}
      />
      {selection ? (
        <ReviewRequestDialog
          request={selection.request}
          detail={selection.detail}
          onClose={handleClose}
          onDecided={handleDecided}
          onReload={handleReload}
        />
      ) : null}
    </>
  )
}
