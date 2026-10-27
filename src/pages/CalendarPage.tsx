import { Suspense, useId } from 'react'
import { useLoaderData } from 'react-router'
import type { calendarLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { AuctionCalendar } from '../features/calendar/AuctionCalendar'
import { CalendarSkeleton } from '../features/calendar/CalendarSkeleton'
import { CalendarToolbar } from '../features/calendar/CalendarToolbar'

export function CalendarPage(): React.JSX.Element {
  const { month, auctions } = useLoaderData<typeof calendarLoader>()
  const monthHeadingId = useId()

  return (
    <PageContainer
      eyebrow="Calendar"
      title="Auction calendar"
      description="Sales month by month, in Paris time. Select an auction to see its details, open its catalogue or request a bid."
    >
      <CalendarToolbar month={month} headingId={monthHeadingId} />
      <Suspense key={month} fallback={<CalendarSkeleton month={month} labelledBy={monthHeadingId} />}>
        <AuctionCalendar month={month} auctions={auctions} labelledBy={monthHeadingId} />
      </Suspense>
    </PageContainer>
  )
}
