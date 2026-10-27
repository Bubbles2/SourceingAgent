import { PageContainer } from '../components/layout/PageContainer'
import { EmptyState } from '../components/ui/EmptyState'

export function TermsPage(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Legal" title="Terms of service">
      <EmptyState title="Coming soon">The terms of service will be published here before launch.</EmptyState>
    </PageContainer>
  )
}
