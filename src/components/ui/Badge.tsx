import type { ReactNode } from 'react'
import { Ban, CircleCheck, CircleMinus, CircleX, Clock, Gavel, Trophy, type LucideIcon } from 'lucide-react'
import type { BidRequestStatus } from '../../features/bid-requests/types'
import './Badge.css'

type BadgeProps = {
  children: ReactNode
  className?: string
}

export function Badge({ children, className }: BadgeProps): React.JSX.Element {
  return <span className={className ? `badge ${className}` : 'badge'}>{children}</span>
}

const statusDetails: Record<BidRequestStatus, { label: string; Icon: LucideIcon }> = {
  pending: { label: 'Pending review', Icon: Clock },
  accepted: { label: 'Accepted', Icon: CircleCheck },
  rejected: { label: 'Rejected', Icon: CircleX },
  cancelled: { label: 'Cancelled', Icon: Ban },
  placed: { label: 'Bid placed', Icon: Gavel },
  won: { label: 'Won', Icon: Trophy },
  lost: { label: 'Lost', Icon: CircleMinus },
}

type StatusBadgeProps = {
  status: BidRequestStatus
}

export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const { label, Icon } = statusDetails[status]

  return (
    <Badge className={`status--${status}`}>
      <Icon size={14} />
      {label}
    </Badge>
  )
}
