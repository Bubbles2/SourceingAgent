import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import './Notice.css'

type NoticeProps = {
  id?: string
  title: string
  children: ReactNode
}

export function Notice({ id, title, children }: NoticeProps): React.JSX.Element {
  return (
    <div id={id} className="notice" role="note">
      <CircleAlert size={22} />
      <p>
        <strong>{title}</strong> {children}
      </p>
    </div>
  )
}
