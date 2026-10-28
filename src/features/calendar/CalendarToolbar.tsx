import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ButtonLink } from '../../components/ui/Button'
import { addMonths, currentMonthKey, formatMonthTitle, type MonthKey } from './calendarDates'
import './Calendar.css'

type CalendarToolbarProps = {
  month: MonthKey
  /** Id for the month heading, which also labels the grid */
  headingId: string
  /** Extra controls at the end of the toolbar, such as New auction for administrators */
  actions?: ReactNode
}

/** Today / previous / next controls. They are links, so each month has its own shareable URL. */
export function CalendarToolbar({ month, headingId, actions }: CalendarToolbarProps): React.JSX.Element {
  const previousMonth = addMonths(month, -1)
  const nextMonth = addMonths(month, 1)

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__controls">
        <ButtonLink to={{ search: `?month=${currentMonthKey()}` }} variant="secondary" preventScrollReset>
          Today
        </ButtonLink>
        <ButtonLink
          to={{ search: `?month=${previousMonth}` }}
          variant="secondary"
          className="cal-toolbar__step"
          aria-label={`Previous month, ${formatMonthTitle(previousMonth)}`}
          preventScrollReset
        >
          <ChevronLeft size={20} />
        </ButtonLink>
        <ButtonLink
          to={{ search: `?month=${nextMonth}` }}
          variant="secondary"
          className="cal-toolbar__step"
          aria-label={`Next month, ${formatMonthTitle(nextMonth)}`}
          preventScrollReset
        >
          <ChevronRight size={20} />
        </ButtonLink>
      </div>
      <h2 id={headingId} className="cal-toolbar__title" aria-live="polite">
        {formatMonthTitle(month)}
      </h2>
      {actions ? <div className="cal-toolbar__actions">{actions}</div> : null}
    </div>
  )
}
