import type { ReactNode } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import './Notice.css'

type NoticeProps = {
  id?: string
  title: string
  /** gold for charges and warnings (DESIGN.md §6.6); info for neutral explanations on blue-tint */
  tone?: 'gold' | 'info'
  children: ReactNode
}

export function Notice({ id, title, tone = 'gold', children }: NoticeProps): React.JSX.Element {
  const Icon = tone === 'info' ? Info : CircleAlert

  return (
    <div id={id} className={tone === 'info' ? 'notice notice--info' : 'notice'} role="note">
      <Icon size={22} />
      <p>
        <strong>{title}</strong> {children}
      </p>
    </div>
  )
}
