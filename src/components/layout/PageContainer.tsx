import type { ReactNode } from 'react'
import './PageContainer.css'

type PageContainerProps = {
  title: string
  eyebrow?: string
  description?: ReactNode
  /** Back link shown above the heading */
  breadcrumb?: ReactNode
  children: ReactNode
}

/** Shared frame for interior pages: document title, page heading and consistent spacing. */
export function PageContainer({ title, eyebrow, description, breadcrumb, children }: PageContainerProps): React.JSX.Element {
  return (
    <div className="section page">
      <title>{`${title} · Parisien Sourcing Agent`}</title>
      <div className="container page__inner">
        <div className="page__header">
          {breadcrumb ? <div className="page__breadcrumb">{breadcrumb}</div> : null}
          {eyebrow ? <p className="eyebrow page__eyebrow">{eyebrow}</p> : null}
          <h1 className="page__title">{title}</h1>
          {description ? <p className="lead">{description}</p> : null}
        </div>
        <div className="page__body">{children}</div>
      </div>
    </div>
  )
}
