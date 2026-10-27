import { featuredAuctionsId, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function AuctionsPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Auctions"
      title="Upcoming auctions"
      description="Browse upcoming and completed sales by date, auction house and location."
    >
      <PlaceholderPanel
        actions={
          <ButtonLink to={{ pathname: paths.home, hash: featuredAuctionsId }}>See featured auctions</ButtonLink>
        }
      >
        The full auction listing is on its way. In the meantime, the home page shows a selection of featured sales.
      </PlaceholderPanel>
    </PageContainer>
  )
}
