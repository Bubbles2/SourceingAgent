import { featuredAuctionsId, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function CataloguesPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Catalogues"
      title="Auction catalogues"
      description="Each auction links to the house's official PDF catalogue, so you can study every lot before requesting a bid."
    >
      <PlaceholderPanel
        actions={
          <ButtonLink to={{ pathname: paths.home, hash: featuredAuctionsId }}>See featured auctions</ButtonLink>
        }
      >
        Catalogue browsing is on its way. The featured auctions on the home page already link to their PDF
        catalogues.
      </PlaceholderPanel>
    </PageContainer>
  )
}
