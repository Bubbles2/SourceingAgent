import { Suspense } from 'react'
import { useLoaderData, useLocation } from 'react-router'
import type { accountLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { Notice } from '../components/ui/Notice'
import { PrototypeNotice } from '../components/ui/PrototypeNotice'
import { AccountDetails } from '../features/auth/AccountDetails'
import { AccountSkeleton } from '../features/auth/AccountSkeleton'
import { isWelcomeState } from '../features/auth/welcomeState'

export function AccountPage(): React.JSX.Element {
  const { account } = useLoaderData<typeof accountLoader>()
  const location = useLocation()

  return (
    <PageContainer eyebrow="Account" title="Your account" description="Your profile and contact details.">
      {isWelcomeState(location.state) ? (
        <Notice tone="success" title="Account created.">
          You are signed in and can request a bid whenever you are ready.
        </Notice>
      ) : null}
      <PrototypeNotice>
        Your profile is saved in this browser only, and the simulated sign-in is not secure: anyone using this browser
        can open this account. Bid requests aren't linked to accounts yet, so My requests still shows the demo
        customer's sample requests.
      </PrototypeNotice>
      <Suspense fallback={<AccountSkeleton />}>
        <AccountDetails account={account} />
      </Suspense>
    </PageContainer>
  )
}
