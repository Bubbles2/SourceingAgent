import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import './Notice.css'

type NoticeTone = 'gold' | 'info' | 'success'

const noticeIcons = { gold: CircleAlert, info: Info, success: CircleCheck } as const

type NoticeProps = {
  id?: string
  title: string
  /** gold for charges and warnings (DESIGN.md §6.6); info for neutral explanations; success for confirmations */
  tone?: NoticeTone
  children: ReactNode
}

export function Notice({ id, title, tone = 'gold', children }: NoticeProps): React.JSX.Element {
  const Icon = noticeIcons[tone]

  return (
    <div id={id} className={tone === 'gold' ? 'notice' : `notice notice--${tone}`} role="note">
      <Icon size={22} />
      <p>
        <strong>{title}</strong> {children}
      </p>
    </div>
  )
}
