import type { ReactNode } from 'react'
import './LoadingRegion.css'

type LoadingRegionProps = {
  /** Announced to screen readers, e.g. "Loading auctions" */
  label: string
  /** Skeleton placeholders; hidden from assistive technology */
  children: ReactNode
}

/** Wraps static skeletons (DESIGN.md §9: nothing animates on load) with a polite loading announcement. */
export function LoadingRegion({ label, children }: LoadingRegionProps): React.JSX.Element {
  return (
    <div role="status">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}
