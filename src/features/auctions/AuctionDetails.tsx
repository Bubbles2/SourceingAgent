import { use } from 'react'
import { ArrowLeft, MapPin } from 'lucide-react'
import { auctionCataloguesId, paths } from '../../app/paths'
import { PageContainer } from '../../components/layout/PageContainer'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FeesNotice } from '../bid-requests/FeesNotice'
import { CatalogueCard } from '../catalogues/CatalogueCard'
import { AuctionFacts } from './AuctionFacts'
import { getSaleStatus, type SaleStatus } from './saleStatus'
import type { AuctionWithCatalogues } from './types'
import './AuctionDetails.css'

type AuctionDetailsProps = {
  auction: Promise<AuctionWithCatalogues | null>
}

export function AuctionDetails({ auction: auctionPromise }: AuctionDetailsProps): React.JSX.Element {
  const auction = use(auctionPromise)

  if (!auction) {
    return <AuctionNotFound />
  }

  const status = getSaleStatus(auction.saleDate)

  return (
    <PageContainer
      breadcrumb={<BackToAuctions status={status} />}
      eyebrow={auction.category}
      title={auction.title}
      description={
        <span className="auction-details__house">
          <MapPin size={18} />
          {`${auction.house} · ${auction.city}`}
        </span>
      }
    >
      <div className="auction-details">
        <div className="auction-details__aside">
          <AuctionFacts auction={auction} status={status} />
          {status === 'upcoming' ? <FeesNotice /> : null}
        </div>

        <div className="auction-details__main">
          {auction.image ? (
            <img className="auction-details__image" src={auction.image.src} alt={auction.image.alt} />
          ) : null}

          <section className="auction-details__section" aria-labelledby="auction-about-title">
            <h2 id="auction-about-title" className="auction-details__heading">
              About the sale
            </h2>
            <p className="auction-details__about">{auction.description}</p>
          </section>

          <section id={auctionCataloguesId} className="auction-details__section" aria-labelledby="auction-catalogues-title">
            <h2 id="auction-catalogues-title" className="auction-details__heading">
              {auction.catalogues.length > 1 ? 'Catalogues' : 'Catalogue'}
            </h2>
            {auction.catalogues.length > 0 ? (
              <div className="catalogue-grid">
                {auction.catalogues.map((catalogue) => (
                  <CatalogueCard key={catalogue.id} catalogue={catalogue} auction={auction} showAuction={false} />
                ))}
              </div>
            ) : (
              <EmptyState title="Catalogue not yet published">
                The auction house hasn't published the catalogue for this sale yet. It will appear here as soon as it
                is available.
              </EmptyState>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  )
}

function BackToAuctions({ status }: { status: SaleStatus }): React.JSX.Element {
  return (
    <ButtonLink variant="link" to={{ pathname: paths.auctions, search: `?status=${status}` }}>
      <ArrowLeft size={16} />
      {status === 'upcoming' ? 'Upcoming auctions' : 'Completed auctions'}
    </ButtonLink>
  )
}

function AuctionNotFound(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Auctions" title="Auction not found">
      <EmptyState
        title="We couldn't find this auction"
        actions={<ButtonLink to={paths.auctions}>View all auctions</ButtonLink>}
      >
        The link may be out of date, or the sale may have been withdrawn by the auction house.
      </EmptyState>
    </PageContainer>
  )
}
