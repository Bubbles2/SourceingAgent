import type { ReactNode } from 'react'
import './PlaceholderPanel.css'

type PlaceholderPanelProps = {
  title?: string
  children: ReactNode
  actions?: ReactNode
}

/** Empty state for screens that are not built yet (mascot at the 120 px size from DESIGN.md §7). */
export function PlaceholderPanel({ title = 'Coming soon', children, actions }: PlaceholderPanelProps): React.JSX.Element {
  return (
    <div className="placeholder-panel">
      <img className="placeholder-panel__mascot" src="/assets/owl-mascot.png" alt="" width={120} height={120} />
      <div className="placeholder-panel__body">
        <h2 className="placeholder-panel__title">{title}</h2>
        <p className="placeholder-panel__text">{children}</p>
        {actions ? <div className="placeholder-panel__actions">{actions}</div> : null}
      </div>
    </div>
  )
}
