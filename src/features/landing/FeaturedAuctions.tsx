import { ArrowRight } from 'lucide-react'
import { featuredAuctionsId, feesNoticeId, paths } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { AuctionCard } from '../auctions/AuctionCard'
import type { Auction } from '../auctions/types'
import { FeesNotice } from '../bid-requests/FeesNotice'
import { SectionHeading } from './SectionHeading'
import './FeaturedAuctions.css'

type FeaturedAuctionsProps = {
  auctions: readonly Auction[]
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

        <div className="grid">
          {auctions.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>

        <FeesNotice id={feesNoticeId} />
      </div>
    </section>
  )
}
