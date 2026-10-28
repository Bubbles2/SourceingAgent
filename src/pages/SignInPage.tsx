import { useSearchParams } from 'react-router'
import { paths, safeRedirectPath } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { AuthAside, AuthLayout } from '../features/auth/AuthLayout'
import { SignInForm } from '../features/auth/SignInForm'

export function SignInPage(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const redirectTo = safeRedirectPath(searchParams.get('redirectTo'))

  return (
    <PageContainer
      eyebrow="Account"
      title="Sign in"
      description={
        redirectTo
          ? 'You need to sign in to see that page.'
          : 'Sign in to request bids and follow their status under My requests.'
      }
    >
      <AuthLayout aside={<SignInAside />}>
        <SignInForm redirectTo={redirectTo ?? paths.account} />
      </AuthLayout>
    </PageContainer>
  )
}

function SignInAside(): React.JSX.Element {
  return (
    <AuthAside title="New here?">
      <p className="auth-aside__text">
        A free account lets you ask the agent to bid on lots at Parisien auctions and follow each request.
      </p>
      <ButtonLink to={paths.register} variant="secondary">
        Create an account
      </ButtonLink>
    </AuthAside>
  )
}
