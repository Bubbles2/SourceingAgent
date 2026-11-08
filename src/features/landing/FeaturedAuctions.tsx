import { Suspense, use } from 'react'
import { ArrowRight } from 'lucide-react'
import { featuredAuctionsId, feesNoticeId, paths } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { AuctionGridSkeleton } from '../auctions/AuctionCardSkeleton'
import type { FeaturedSales } from '../auctions/auctionService'
import { FeesNotice } from '../bid-requests/FeesNotice'
import { FeaturedAuctionCard } from './FeaturedAuctionCard'
import { SectionHeading } from './SectionHeading'
import './FeaturedAuctions.css'

type FeaturedAuctionsProps = {
  auctions: Promise<FeaturedSales>
}

export function FeaturedAuctions({ auctions }: FeaturedAuctionsProps): React.JSX.Element {
  return (
    <section id={featuredAuctionsId} className="section" aria-labelledby="featured-auctions-title">
      <div className="container featured-auctions">
        <Suspense
          fallback={
            <>
              <FeaturedAuctionsHead upcoming />
              <AuctionGridSkeleton count={3} label="Loading featured auctions" />
            </>
          }
        >
          <FeaturedAuctionGrid auctions={auctions} />
        </Suspense>

        <FeesNotice id={feesNoticeId} />
      </div>
    </section>
  )
}

/** "Upcoming sales", or "Recent sales" while nothing is upcoming */
function FeaturedAuctionsHead({ upcoming }: { upcoming: boolean }): React.JSX.Element {
  return (
    <div className="featured-auctions__head">
      <SectionHeading id="featured-auctions-title" eyebrow={upcoming ? 'Upcoming sales' : 'Recent sales'} title="Featured auctions" />
      <ButtonLink to={paths.auctions} variant="link" className="featured-auctions__view-all">
        View all auctions
        <ArrowRight size={18} />
      </ButtonLink>
    </div>
  )
}

function FeaturedAuctionGrid({ auctions: auctionsPromise }: FeaturedAuctionsProps): React.JSX.Element {
  const { auctions, upcoming } = use(auctionsPromise)

  if (auctions.length === 0) {
    return (
      <>
        <FeaturedAuctionsHead upcoming />
        <EmptyState
          title="No upcoming sales right now"
          actions={
            <ButtonLink to={{ pathname: paths.auctions, search: '?status=completed' }} variant="secondary">
              See completed auctions
            </ButtonLink>
          }
        >
          New sales are added as auction houses publish their calendars. Check back soon.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <FeaturedAuctionsHead upcoming={upcoming} />
      {upcoming ? null : (
        <p className="featured-auctions__note">
          No upcoming sales right now, so these are the most recent ones. New sales appear as auction houses publish their calendars.
        </p>
      )}
      <div className="grid">
        {auctions.map((auction) => (
          <FeaturedAuctionCard key={auction.id} auction={auction} />
        ))}
      </div>
    </>
  )
}
