import { featuredAuctionsId, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function CalendarPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Calendar"
      title="Auction calendar"
      description="Upcoming sales month by month. Select an auction to see its description and catalogue."
    >
      <PlaceholderPanel
        actions={
          <ButtonLink to={{ pathname: paths.home, hash: featuredAuctionsId }}>See featured auctions</ButtonLink>
        }
      >
        The monthly calendar is on its way. In the meantime, the home page shows the next featured sales.
      </PlaceholderPanel>
    </PageContainer>
  )
}
