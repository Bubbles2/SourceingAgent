import { featuredAuctionsId, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function CalendarPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Calendar"
      title="Auction calendar"
      description="Upcoming sales month by month. Select an auction to see its description and catalogue."
    >
      <EmptyState
        title="Coming soon"
        actions={
          <ButtonLink to={{ pathname: paths.home, hash: featuredAuctionsId }}>See featured auctions</ButtonLink>
        }
      >
        The monthly calendar is on its way. In the meantime, the home page shows the next featured sales.
      </EmptyState>
    </PageContainer>
  )
}
