import './Ribbon.css'

type RibbonProps = {
  variant?: 'header' | 'signoff'
}

/** Tricolour ribbon (DESIGN.md §2.3): once under the header, optionally as the footer sign-off. */
export function Ribbon({ variant = 'header' }: RibbonProps): React.JSX.Element {
  return (
    <div className={variant === 'signoff' ? 'ribbon ribbon--signoff' : 'ribbon'} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}
