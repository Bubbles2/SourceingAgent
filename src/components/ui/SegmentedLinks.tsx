import { Link, type To } from 'react-router'
import './SegmentedLinks.css'

export type SegmentedLinkOption = {
  label: string
  to: To
  isCurrent: boolean
}

type SegmentedLinksProps = {
  /** Accessible name for the group, e.g. "Show auctions" */
  label: string
  options: readonly SegmentedLinkOption[]
}

/** A row of mutually exclusive filter links that keep their state in the URL. */
export function SegmentedLinks({ label, options }: SegmentedLinksProps): React.JSX.Element {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.label}
          to={option.to}
          className="segmented__option"
          aria-current={option.isCurrent ? 'true' : undefined}
          preventScrollReset
        >
          {option.label}
        </Link>
      ))}
    </div>
  )
}
