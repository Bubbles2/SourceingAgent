import { PageContainer } from '../components/layout/PageContainer'
import { EmptyState } from '../components/ui/EmptyState'

export function PrivacyPage(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Legal" title="Privacy">
      <EmptyState title="Coming soon">The privacy policy will be published here before launch.</EmptyState>
    </PageContainer>
  )
}
