import { CircleMinus, Lock } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import type { LotAvailability } from './types'
import './AvailabilityBadge.css'

const availabilityDetails = {
  reserved: { label: 'Reserved', Icon: Lock },
  'sale-ended': { label: 'Sale ended', Icon: CircleMinus },
} as const

/** Public lot availability — text plus icon, never colour alone. */
export function AvailabilityBadge({ availability }: { availability: LotAvailability }): React.JSX.Element {
  const { label, Icon } = availabilityDetails[availability]

  return (
    <Badge className={`availability--${availability}`}>
      <Icon size={14} />
      {label}
    </Badge>
  )
}
