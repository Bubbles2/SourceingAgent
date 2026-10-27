import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { auctionDetailsLoader } from '../app/loaders'
import { AuctionDetails } from '../features/auctions/AuctionDetails'
import { AuctionDetailsSkeleton } from '../features/auctions/AuctionDetailsSkeleton'

export function AuctionDetailsPage(): React.JSX.Element {
  const { auctionId, auction } = useLoaderData<typeof auctionDetailsLoader>()

  return (
    <Suspense key={auctionId} fallback={<AuctionDetailsSkeleton />}>
      <AuctionDetails auction={auction} />
    </Suspense>
  )
}
