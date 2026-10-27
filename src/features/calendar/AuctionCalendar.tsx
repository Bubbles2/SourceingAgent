import { use, useState } from 'react'
import { todayInParis } from '../auctions/saleStatus'
import type { AuctionWithCatalogues } from '../auctions/types'
import { AuctionDialog } from './AuctionDialog'
import { formatMonthTitle, groupBySaleDate, type MonthKey } from './calendarDates'
import { MonthAgenda } from './MonthAgenda'
import { MonthGrid } from './MonthGrid'

type AuctionCalendarProps = {
  month: MonthKey
  /** Sales across the whole visible grid, including the padding days of neighbouring months */
  auctions: Promise<readonly AuctionWithCatalogues[]>
  labelledBy: string
}

export function AuctionCalendar({ month, auctions: auctionsPromise, labelledBy }: AuctionCalendarProps): React.JSX.Element {
  const auctions = use(auctionsPromise)
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null)

  const auctionsByDate = groupBySaleDate(auctions)
  const hasSalesThisMonth = auctions.some((auction) => auction.saleDate.startsWith(month))
  const selectedAuction = auctions.find((auction) => auction.id === selectedAuctionId)
  const today = todayInParis()

  function handleDialogClose(): void {
    setSelectedAuctionId(null)
  }

  return (
    <>
      <MonthGrid
        month={month}
        auctionsByDate={auctionsByDate}
        today={today}
        labelledBy={labelledBy}
        onSelectAuction={setSelectedAuctionId}
      />
      <MonthAgenda month={month} auctionsByDate={auctionsByDate} today={today} onSelectAuction={setSelectedAuctionId} />
      {hasSalesThisMonth ? null : <p className="cal-empty">{`No auctions are scheduled in ${formatMonthTitle(month)}.`}</p>}
      {selectedAuction ? <AuctionDialog auction={selectedAuction} onClose={handleDialogClose} /> : null}
    </>
  )
}
