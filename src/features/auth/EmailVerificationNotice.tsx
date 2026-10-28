import { Mail } from 'lucide-react'
import { ResendVerification } from './ResendVerification'

type EmailVerificationNoticeProps = {
  email: string
  title?: string
}

/** Shown until the customer opens the link we emailed them. */
export function EmailVerificationNotice({
  email,
  title = 'Confirm your email address.',
}: EmailVerificationNoticeProps): React.JSX.Element {
  return (
    <div className="notice verify-notice" role="note">
      <Mail size={22} />
      <div className="verify-notice__body">
        <p>
          <strong>{title}</strong> We sent a link to {email}. Open it to confirm that this address
          is yours. Can't find it? Check your spam folder, or ask for a new link.
        </p>
        <ResendVerification />
      </div>
    </div>
  )
}
