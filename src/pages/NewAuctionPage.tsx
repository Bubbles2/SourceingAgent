import { ArrowLeft } from 'lucide-react'
import { useLoaderData } from 'react-router'
import type { newAuctionLoader } from '../app/loaders'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { AuctionForm } from '../features/admin/AuctionForm'
import { emptyAuctionValues } from '../features/admin/auctionFormRules'

/** A new sale; opened from the calendar, its date is already filled in. */
export function NewAuctionPage(): React.JSX.Element {
  const { saleDate } = useLoaderData<typeof newAuctionLoader>()

  return (
    <PageContainer
      breadcrumb={
        <ButtonLink variant="link" to={paths.adminAuctions}>
          <ArrowLeft size={16} />
          Auctions
        </ButtonLink>
      }
      eyebrow="Administration"
      title="New auction"
      description="Save it as a draft to finish later, or publish it straight away. Add its catalogue once it's created."
    >
      <AuctionForm key={saleDate} mode="create" initialValues={emptyAuctionValues(saleDate)} cancelTo={paths.adminAuctions} />
    </PageContainer>
  )
}
