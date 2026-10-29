import { Suspense, use } from 'react'
import { ArrowRight } from 'lucide-react'
import { featuredAuctionsId, feesNoticeId, paths } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { AuctionGridSkeleton } from '../auctions/AuctionCardSkeleton'
import type { Auction } from '../auctions/types'
import { FeesNotice } from '../bid-requests/FeesNotice'
import { FeaturedAuctionCard } from './FeaturedAuctionCard'
import { SectionHeading } from './SectionHeading'
import './FeaturedAuctions.css'

type FeaturedAuctionsProps = {
  auctions: Promise<readonly Auction[]>
}

export function FeaturedAuctions({ auctions }: FeaturedAuctionsProps): React.JSX.Element {
  return (
    <section id={featuredAuctionsId} className="section" aria-labelledby="featured-auctions-title">
      <div className="container featured-auctions">
        <div className="featured-auctions__head">
          <SectionHeading id="featured-auctions-title" eyebrow="Upcoming sales" title="Featured auctions" />
          <ButtonLink to={paths.auctions} variant="link" className="featured-auctions__view-all">
            View all auctions
            <ArrowRight size={18} />
          </ButtonLink>
        </div>

        <Suspense fallback={<AuctionGridSkeleton count={3} label="Loading featured auctions" />}>
          <FeaturedAuctionGrid auctions={auctions} />
        </Suspense>

        <FeesNotice id={feesNoticeId} />
      </div>
    </section>
  )
}

function FeaturedAuctionGrid({ auctions: auctionsPromise }: FeaturedAuctionsProps): React.JSX.Element {
  const auctions = use(auctionsPromise)

  if (auctions.length === 0) {
    return (
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
    )
  }

  return (
    <div className="grid">
      {auctions.map((auction) => (
        <FeaturedAuctionCard key={auction.id} auction={auction} />
      ))}
    </div>
  )
}
