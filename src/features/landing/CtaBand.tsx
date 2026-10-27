import { useId, type ReactNode } from 'react'
import './CtaBand.css'

type CtaBandProps = {
  title: string
  lead: string
  /** The band's buttons: a gold primary and a ghost-on-navy secondary */
  children: ReactNode
}

export function CtaBand({ title, lead, children }: CtaBandProps): React.JSX.Element {
  const titleId = useId()

  return (
    <section className="cta-band" aria-labelledby={titleId}>
      <div className="container cta-band__inner">
        <div className="cta-band__content">
          <h2 id={titleId} className="cta-band__title">
            {title}
          </h2>
          <p className="cta-band__lead">{lead}</p>
          <div className="cta-band__actions">{children}</div>
        </div>
        <img
          className="cta-band__mascot"
          src="/assets/owl-mascot.png"
          alt="The Parisien Sourcing Agent owl mascot holding a magnifying glass and a gilt frame"
          width={220}
          height={220}
          loading="lazy"
        />
      </div>
    </section>
  )
}
