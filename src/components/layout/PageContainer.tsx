import type { ReactNode } from 'react'
import './PageContainer.css'

type PageContainerProps = {
  title: string
  eyebrow?: string
  description?: ReactNode
  children: ReactNode
}

/** Shared frame for interior pages: document title, page heading and consistent spacing. */
export function PageContainer({ title, eyebrow, description, children }: PageContainerProps): React.JSX.Element {
  return (
    <div className="section page">
      <title>{`${title} · Parisien Sourcing Agent`}</title>
      <div className="container page__inner">
        <div className="page__header">
          {eyebrow ? <p className="eyebrow page__eyebrow">{eyebrow}</p> : null}
          <h1 className="page__title">{title}</h1>
          {description ? <p className="lead">{description}</p> : null}
        </div>
        <div className="page__body">{children}</div>
      </div>
    </div>
  )
}
