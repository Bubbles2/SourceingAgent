import { PageContainer } from '../components/layout/PageContainer'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function PrivacyPage(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Legal" title="Privacy">
      <PlaceholderPanel>The privacy policy will be published here before launch.</PlaceholderPanel>
    </PageContainer>
  )
}
