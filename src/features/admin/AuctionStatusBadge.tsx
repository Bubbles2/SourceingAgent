import { Ban, CircleCheck, PencilLine, type LucideIcon } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import type { AuctionStatus } from '../auctions/types'
import './AuctionStatusBadge.css'

const statusDetails: Record<AuctionStatus, { label: string; Icon: LucideIcon }> = {
  draft: { label: 'Draft', Icon: PencilLine },
  published: { label: 'Published', Icon: CircleCheck },
  cancelled: { label: 'Cancelled', Icon: Ban },
}

export function auctionStatusLabel(status: AuctionStatus): string {
  return statusDetails[status].label
}

/** Whether a sale is on the website. Text and icon, never colour alone (DESIGN.md §10). */
export function AuctionStatusBadge({ status }: { status: AuctionStatus }): React.JSX.Element {
  const { label, Icon } = statusDetails[status]

  return (
    <Badge className={`auction-status--${status}`}>
      <Icon size={14} />
      {label}
    </Badge>
  )
}
