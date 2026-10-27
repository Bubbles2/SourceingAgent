import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function NotFoundPage(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Error 404" title="Page not found">
      <PlaceholderPanel title="This page doesn't exist" actions={<ButtonLink to={paths.home}>Back to the home page</ButtonLink>}>
        The address may be mistyped, or the page may have moved.
      </PlaceholderPanel>
    </PageContainer>
  )
}
