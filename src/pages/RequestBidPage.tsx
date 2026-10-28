import { Suspense, use } from 'react'
import { useLoaderData } from 'react-router'
import type { requestBidLoader } from '../app/loaders'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Notice } from '../components/ui/Notice'
import type { AuctionWithCatalogues } from '../features/auctions/types'
import { EmailVerificationNotice } from '../features/auth/EmailVerificationNotice'
import { useCurrentCustomer } from '../features/auth/useCurrentCustomer'
import { BidRequestForm } from '../features/bid-requests/BidRequestForm'
import { BidRequestFormSkeleton } from '../features/bid-requests/BidRequestFormSkeleton'

// requestBidLoader sends visitors to sign in first. The API refuses requests from anyone else too;
// this page just explains why before the form is filled in.
export function RequestBidPage(): React.JSX.Element {
  const { auctions, auctionId, catalogueId } = useLoaderData<typeof requestBidLoader>()
  const customer = useCurrentCustomer()

  return (
    <PageContainer
      eyebrow="Bid requests"
      title="Request a bid"
      description="Ask the agent to bid on a lot for you. Choose the sale and catalogue, then enter the lot number and the most you are willing to pay."
    >
      {!customer ? (
        <EmptyState title="You're signed out" actions={<ButtonLink to={paths.signIn}>Sign in</ButtonLink>}>
          Sign in again to request a bid.
        </EmptyState>
      ) : customer.role !== 'customer' ? (
        <Notice tone="info" title="Customer accounts only.">
          Bid requests are made by customers. Administrator accounts review them instead.
        </Notice>
      ) : !customer.emailVerified ? (
        <EmailVerificationNotice email={customer.email} title="Confirm your email address to request bids." />
      ) : (
        // A new pre-selection (?auction=…) starts a fresh form
        <Suspense key={`${auctionId}|${catalogueId}`} fallback={<BidRequestFormSkeleton />}>
          <BidRequestSection auctions={auctions} auctionId={auctionId} catalogueId={catalogueId} />
        </Suspense>
      )}
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
