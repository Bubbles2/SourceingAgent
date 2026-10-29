import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { adminDashboardLoader } from '../app/loaders'
import { paths, reviewRequestsPath } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { SummaryCards, SummaryCardsSkeleton } from '../features/admin/SummaryCards'

export function AdminDashboardPage(): React.JSX.Element {
  const { summary } = useLoaderData<typeof adminDashboardLoader>()

  return (
    <PageContainer
      eyebrow="Administration"
      title="Dashboard"
      description="Sales, lots and bid requests at a glance. Sales and lots come from the auction monitor; select a figure to open the list behind it."
    >
      <div className="admin-actions">
        <ButtonLink to={reviewRequestsPath({ view: 'pending' })}>Review bid requests</ButtonLink>
        <ButtonLink to={paths.calendar} variant="secondary">
          Open the calendar
        </ButtonLink>
      </div>
      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummaryCards summary={summary} />
      </Suspense>
    </PageContainer>
  )
}
