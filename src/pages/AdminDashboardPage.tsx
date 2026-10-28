import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { adminDashboardLoader } from '../app/loaders'
import { newAuctionPath, newCataloguePath, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { SummaryCards, SummaryCardsSkeleton } from '../features/admin/SummaryCards'

export function AdminDashboardPage(): React.JSX.Element {
  const { summary } = useLoaderData<typeof adminDashboardLoader>()

  return (
    <PageContainer
      eyebrow="Administration"
      title="Dashboard"
      description="Sales, catalogues and bid requests at a glance. Select a figure to open the list behind it."
    >
      <div className="admin-actions">
        <ButtonLink to={newAuctionPath()}>New auction</ButtonLink>
        <ButtonLink to={newCataloguePath()} variant="secondary">
          Add catalogue
        </ButtonLink>
        <ButtonLink to={paths.calendar} variant="secondary">
          Plan on the calendar
        </ButtonLink>
      </div>
      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummaryCards summary={summary} />
      </Suspense>
    </PageContainer>
  )
}
