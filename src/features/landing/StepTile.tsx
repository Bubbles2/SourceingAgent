import type { ReactNode } from 'react'
import './StepTile.css'

type StepTileProps = {
  step: number
  title: string
  children: ReactNode
}

/** One step of "How it works"; render inside an `<ol>`. */
export function StepTile({ step, title, children }: StepTileProps): React.JSX.Element {
  return (
    <li className="step-tile">
      <span className="step-tile__number">{step}</span>
      <h3 className="step-tile__title">{title}</h3>
      <p className="step-tile__text">{children}</p>
    </li>
  )
}
