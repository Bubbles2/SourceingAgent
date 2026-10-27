import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import './FeatureTile.css'

type FeatureTileProps = {
  icon: LucideIcon
  title: string
  children: ReactNode
}

export function FeatureTile({ icon: Icon, title, children }: FeatureTileProps): React.JSX.Element {
  return (
    <div className="feature-tile">
      <span className="feature-tile__icon">
        <Icon size={24} />
      </span>
      <h3 className="feature-tile__title">{title}</h3>
      <p className="feature-tile__text">{children}</p>
    </div>
  )
}
