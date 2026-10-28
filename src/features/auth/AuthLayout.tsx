import { useId, type ReactNode } from 'react'
import './AuthLayout.css'

type AuthLayoutProps = {
  children: ReactNode
  aside?: ReactNode
}

/** The form column with an optional aside beside it; the aside drops below on narrow screens. */
export function AuthLayout({ children, aside }: AuthLayoutProps): React.JSX.Element {
  return (
    <div className="auth-layout">
      <div className="auth-layout__main">{children}</div>
      {aside}
    </div>
  )
}

type AuthAsideProps = {
  title: string
  children: ReactNode
}

/** Mascot at 120 px (DESIGN.md §7, hidden on small screens) with a short heading and supporting content. */
export function AuthAside({ title, children }: AuthAsideProps): React.JSX.Element {
  const titleId = useId()

  return (
    <aside className="auth-aside" aria-labelledby={titleId}>
      <img className="auth-aside__mascot" src="/assets/owl-mascot-440.png" alt="" width={120} height={120} />
      <h2 id={titleId} className="auth-aside__title">
        {title}
      </h2>
      {children}
    </aside>
  )
}
