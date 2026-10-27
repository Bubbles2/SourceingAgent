import type { ReactNode } from 'react'
import { Notice } from './Notice'

type PrototypeNoticeProps = {
  children: ReactNode
}

/** Marks behaviour that is simulated in the browser rather than enforced by a server. */
export function PrototypeNotice({ children }: PrototypeNoticeProps): React.JSX.Element {
  return (
    <Notice tone="info" title="Prototype.">
      {children}
    </Notice>
  )
}
