import { useId } from 'react'
import { StatusBadge } from '../../components/ui/Badge'
import { bidRequestStatuses } from './types'
import './StatusLegend.css'

export function StatusLegend(): React.JSX.Element {
  const titleId = useId()

  return (
    <section className="status-legend" aria-labelledby={titleId}>
      <h2 id={titleId} className="status-legend__title">
        Request statuses
      </h2>
      <ul className="status-legend__list">
        {bidRequestStatuses.map((status) => (
          <li key={status}>
            <StatusBadge status={status} />
          </li>
        ))}
      </ul>
    </section>
  )
}
