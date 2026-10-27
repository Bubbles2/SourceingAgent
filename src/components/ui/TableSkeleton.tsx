import { LoadingRegion } from './LoadingRegion'
import './Table.css'

type TableSkeletonProps = {
  rows: number
  label: string
}

export function TableSkeleton({ rows, label }: TableSkeletonProps): React.JSX.Element {
  return (
    <LoadingRegion label={label}>
      <div className="table-wrap table-skeleton">
        <div className="table-skeleton__head" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="table-skeleton__row">
            <span className="skeleton skeleton--medium" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}
