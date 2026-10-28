import { use } from 'react'
import { Link } from 'react-router'
import { paths, reviewRequestsPath } from '../../app/paths'
import { LoadingRegion } from '../../components/ui/LoadingRegion'
import type { AdminSummary } from './adminSummaryService'
import './SummaryCards.css'

const countFormatter = new Intl.NumberFormat('en-GB')

type Card = {
  label: string
  value: number
  note: string | null
  to: string
}

function plural(count: number, one: string, many: string): string {
  return `${countFormatter.format(count)} ${count === 1 ? one : many}`
}

function cardsFor(summary: AdminSummary): Card[] {
  return [
    {
      label: 'Upcoming auctions',
      value: summary.upcomingAuctions,
      note: summary.draftAuctions > 0 ? `Plus ${plural(summary.draftAuctions, 'draft', 'drafts')}` : null,
      to: `${paths.adminAuctions}?view=upcoming`,
    },
    {
      label: 'Published catalogues',
      value: summary.publishedCatalogues,
      note: null,
      to: paths.adminCatalogues,
    },
    {
      label: 'Pending bid requests',
      value: summary.pendingRequests,
      note: summary.pendingRequests > 0 ? 'Waiting for your review' : null,
      to: reviewRequestsPath({ view: 'pending' }),
    },
    {
      label: 'Accepted requests',
      value: summary.acceptedRequests,
      note: summary.placedBids > 0 ? `${plural(summary.placedBids, 'bid', 'bids')} placed, awaiting a result` : null,
      to: reviewRequestsPath({ view: 'accepted' }),
    },
    {
      label: 'Completed auctions',
      value: summary.completedAuctions,
      note: null,
      to: `${paths.adminAuctions}?view=completed`,
    },
  ]
}

/** The dashboard's counts; each card opens the list behind it. */
export function SummaryCards({ summary: summaryPromise }: { summary: Promise<AdminSummary> }): React.JSX.Element {
  const cards = cardsFor(use(summaryPromise))

  return (
    <ul className="summary-cards">
      {cards.map((card) => (
        <li key={card.label}>
          <Link to={card.to} className="summary-card">
            <span className="summary-card__value">{countFormatter.format(card.value)}</span>
            <span className="summary-card__label">{card.label}</span>
            {card.note ? <span className="summary-card__note">{card.note}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function SummaryCardsSkeleton(): React.JSX.Element {
  return (
    <LoadingRegion label="Loading the summary">
      <ul className="summary-cards">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className="summary-card summary-card--skeleton">
            <span className="skeleton skeleton--title summary-card__value-skeleton" />
            <span className="skeleton skeleton--short" />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  )
}
