import { useSearchParams } from 'react-router'
import { PageContainer } from '../../src/components/layout/PageContainer'
import { SegmentedLinks } from '../../src/components/ui/SegmentedLinks'
import { MaintainPanel } from './MaintainPanel'
import { QualityPanel } from './QualityPanel'
import { ReviewPanel } from './ReviewPanel'
import { ToolsPanel } from './ToolsPanel'
import './searchAdmin.css'

const views = [
  { value: 'maintain', label: 'Run & maintain' },
  { value: 'review', label: 'Taxonomy review' },
  { value: 'tools', label: 'Search tools' },
  { value: 'quality', label: 'Quality' },
] as const

type View = (typeof views)[number]['value']

function readView(value: string | null): View {
  return views.find((view) => view.value === value)?.value ?? 'maintain'
}

/**
 * Administration of the taxonomy search (the taxonomy_search service). Only administrators reach this page
 * (the route's loader and AdminLayout check, and the API checks again).
 */
export function SearchAdminPage(): React.JSX.Element {
  const [params] = useSearchParams()
  const view = readView(params.get('view'))

  return (
    <PageContainer
      eyebrow="Administration"
      title="Search"
      description="Keep the taxonomy search up to date, review the taxonomy behind it, try queries and check search quality."
    >
      <SegmentedLinks
        label="Search administration"
        options={views.map((option) => ({ label: option.label, to: { search: `?view=${option.value}` }, isCurrent: option.value === view }))}
      />
      {view === 'maintain' ? <MaintainPanel /> : null}
      {view === 'review' ? <ReviewPanel /> : null}
      {view === 'tools' ? <ToolsPanel /> : null}
      {view === 'quality' ? <QualityPanel /> : null}
    </PageContainer>
  )
}
