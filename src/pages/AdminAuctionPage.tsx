import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { adminAuctionLoader } from '../app/loaders'
import { PageLoading } from '../components/layout/PageLoading'
import { AdminAuctionDetails } from '../features/admin/AdminAuctionDetails'

export function AdminAuctionPage(): React.JSX.Element {
  const { auctionId, auction } = useLoaderData<typeof adminAuctionLoader>()

  return (
    <Suspense key={auctionId} fallback={<PageLoading />}>
      <AdminAuctionDetails auction={auction} />
    </Suspense>
  )
}
