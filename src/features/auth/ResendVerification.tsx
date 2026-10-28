import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ApiError } from '../../services/apiClient'
import { resendVerificationEmail } from './authService'

type ResendState = { status: 'idle' } | { status: 'sending' } | { status: 'sent'; message: string } | { status: 'failed'; message: string }

/** "Send a new link" for a signed-in customer whose email address isn't confirmed yet. */
export function ResendVerification(): React.JSX.Element {
  const [state, setState] = useState<ResendState>({ status: 'idle' })

  async function resend(): Promise<void> {
    setState({ status: 'sending' })
    try {
      setState({ status: 'sent', message: await resendVerificationEmail() })
    } catch (error) {
      setState({
        status: 'failed',
        message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      })
    }
  }

  function handleClick(): void {
    void resend()
  }

  return (
    <div className="resend-verification">
      <Button variant="secondary" disabled={state.status === 'sending'} onClick={handleClick}>
        {state.status === 'sending' ? 'Sending…' : 'Send a new link'}
      </Button>
      <p className="resend-verification__status" role="status">
        {state.status === 'sent' ? state.message : null}
      </p>
      {state.status === 'failed' ? (
        <p className="field__error" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
