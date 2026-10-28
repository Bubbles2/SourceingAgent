import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { To } from 'react-router'
import { ButtonLink } from './Button'
import './Pagination.css'

type PaginationProps = {
  /** Accessible name for the navigation, e.g. "Pages of auctions" */
  label: string
  page: number
  pageCount: number
  /** Where a page number leads */
  pageLink: (page: number) => To
}

/** Previous and next links between pages of results. Renders nothing when everything fits on one page. */
export function Pagination({ label, page, pageCount, pageLink }: PaginationProps): React.JSX.Element | null {
  if (pageCount <= 1) {
    return null
  }

  return (
    <nav className="pagination" aria-label={label}>
      {page > 1 ? (
        <ButtonLink to={pageLink(page - 1)} variant="secondary" className="pagination__previous" rel="prev">
          <ArrowLeft size={18} />
          Previous<span className="visually-hidden"> page</span>
        </ButtonLink>
      ) : null}
      <p className="pagination__status">{`Page ${page} of ${pageCount}`}</p>
      {page < pageCount ? (
        <ButtonLink to={pageLink(page + 1)} variant="secondary" className="pagination__next" rel="next">
          Next<span className="visually-hidden"> page</span>
          <ArrowRight size={18} />
        </ButtonLink>
      ) : null}
    </nav>
  )
}
