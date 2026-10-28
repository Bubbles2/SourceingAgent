import { use, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Form } from 'react-router'
import { Button, ButtonLink } from '../../components/ui/Button'
import { formatDayMonthYear } from '../auctions/formatAuction'
import type { AuctionWithCatalogues } from '../auctions/types'
import type { ReviewView } from './types'
import '../../components/form/Form.css'
import './ReviewFilters.css'

type ReviewFiltersProps = {
  view: ReviewView
  auction: string
  customer: string
  auctions: Promise<AuctionWithCatalogues[]>
}

/** Narrows the list to one sale and/or a customer. A GET form, so the filters live in the address. */
export function ReviewFilters({ view, auction, customer, auctions }: ReviewFiltersProps): React.JSX.Element {
  const saleId = useId()
  const customerId = useId()
  const sales = use(auctions)

  return (
    // Re-keyed so the fields show the address's filters after back and forward navigation
    <Form key={`${auction}|${customer}`} method="get" className="review-filters" role="search" aria-label="Filter requests">
      <input type="hidden" name="view" value={view} />
      <div className="field review-filters__sale">
        <label className="field__label" htmlFor={saleId}>
          Sale
        </label>
        <div className="select-input">
          <select id={saleId} name="auction" className="field__input" defaultValue={auction}>
            <option value="">All sales</option>
            {sales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {`${formatDayMonthYear(sale.saleDate)} · ${sale.title}`}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="select-input__icon" />
        </div>
      </div>
      <div className="field review-filters__customer">
        <label className="field__label" htmlFor={customerId}>
          Customer
        </label>
        <input
          id={customerId}
          type="search"
          name="customer"
          className="field__input"
          defaultValue={customer}
          maxLength={200}
          placeholder="Name, email or company"
        />
      </div>
      <div className="review-filters__actions">
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {auction || customer ? (
          <ButtonLink to={{ search: `?view=${view}` }} variant="link">
            Clear filters
          </ButtonLink>
        ) : null}
      </div>
    </Form>
  )
}
