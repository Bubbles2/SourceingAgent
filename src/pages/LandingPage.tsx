import { ButtonLink } from '../components/ui/Button'
import { featuredAuctions } from '../features/auctions/mockAuctions'
import { CtaBand } from '../features/landing/CtaBand'
import { FeaturedAuctions } from '../features/landing/FeaturedAuctions'
import { Hero } from '../features/landing/Hero'
import { HowItWorks } from '../features/landing/HowItWorks'
import { WhyAgent } from '../features/landing/WhyAgent'
import { paths } from '../app/paths'

export function LandingPage(): React.JSX.Element {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FeaturedAuctions auctions={featuredAuctions} />
      <WhyAgent />
      <CtaBand
        title="Ready for your first Parisien auction?"
        lead="Create a free account to submit bid requests, follow their status and keep every catalogue in one place."
      >
        <ButtonLink to={paths.register} variant="gold" size="lg">
          Create account
        </ButtonLink>
        <ButtonLink to={paths.calendar} variant="ghost-on-navy" size="lg">
          See the auction calendar
        </ButtonLink>
      </CtaBand>
    </>
  )
}
