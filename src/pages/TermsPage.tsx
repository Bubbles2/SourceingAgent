import { PageContainer } from '../components/layout/PageContainer'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function TermsPage(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Legal" title="Terms of service">
      <PlaceholderPanel>The terms of service will be published here before launch.</PlaceholderPanel>
    </PageContainer>
  )
}
