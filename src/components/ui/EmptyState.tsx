import type { ReactNode } from 'react'
import './EmptyState.css'

type EmptyStateProps = {
  title: string
  children: ReactNode
  actions?: ReactNode
}

/** Empty, not-found and coming-soon states (mascot at the 120 px size from DESIGN.md §7). */
export function EmptyState({ title, children, actions }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty-state">
      <img className="empty-state__mascot" src="/assets/owl-mascot.png" alt="" width={120} height={120} />
      <div className="empty-state__body">
        <h2 className="empty-state__title">{title}</h2>
        <p className="empty-state__text">{children}</p>
        {actions ? <div className="empty-state__actions">{actions}</div> : null}
      </div>
    </div>
  )
}
