import { Suspense, use } from 'react'
import { useLoaderData } from 'react-router'
import type { requestBidLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import type { AuctionWithCatalogues } from '../features/auctions/types'
import { BidRequestForm } from '../features/bid-requests/BidRequestForm'
import { BidRequestFormSkeleton } from '../features/bid-requests/BidRequestFormSkeleton'
import { PrototypeNotice } from '../components/ui/PrototypeNotice'

export function RequestBidPage(): React.JSX.Element {
  const { auctions, auctionId, catalogueId } = useLoaderData<typeof requestBidLoader>()

  return (
    <PageContainer
      eyebrow="Bid requests"
      title="Request a bid"
      description="Ask the agent to bid on a lot for you. Choose the sale and catalogue, then enter the lot number and the most you are willing to pay."
    >
      <PrototypeNotice>
        This form runs entirely in your browser as a demo customer. Requests are saved in this browser only and checked
        against sample data. In the live service, the server will require you to sign in, check every field again and
        enforce one accepted request per lot.
      </PrototypeNotice>
      {/* A new pre-selection (?auction=…) starts a fresh form */}
      <Suspense key={`${auctionId}|${catalogueId}`} fallback={<BidRequestFormSkeleton />}>
        <BidRequestSection auctions={auctions} auctionId={auctionId} catalogueId={catalogueId} />
      </Suspense>
    </PageContainer>
  )
}

type BidRequestSectionProps = {
  auctions: Promise<readonly AuctionWithCatalogues[]>
  auctionId: string | null
  catalogueId: string | null
}

function BidRequestSection({ auctions, auctionId, catalogueId }: BidRequestSectionProps): React.JSX.Element {
  return <BidRequestForm auctions={use(auctions)} initialAuctionId={auctionId} initialCatalogueId={catalogueId} />
}
