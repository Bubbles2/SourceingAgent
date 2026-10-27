import { Lock, Search, TextAlignStart } from 'lucide-react'
import { FeatureTile } from './FeatureTile'
import { SectionHeading } from './SectionHeading'
import './landing.css'

const features = [
  {
    icon: Search,
    title: 'Present at requested sales',
    text: 'Your agent is based in Paris and bids in person or by phone, following the instructions you attach to each request.',
  },
  {
    icon: TextAlignStart,
    title: 'Clear status, start to finish',
    text: 'Follow each request from Pending review to Accepted, Bid placed, and Won or Lost — all in one place under My requests.',
  },
  {
    icon: Lock,
    title: 'Your bids stay private',
    text: 'Requested lots are listed publicly so no two customers clash on the same lot, but your identity and maximum bid are never disclosed.',
  },
] as const

export function WhyAgent(): React.JSX.Element {
  return (
    <section id="why" className="section section--white" aria-labelledby="why-title">
      <div className="container landing-stack">
        <SectionHeading id="why-title" eyebrow="Why a sourcing agent" title="A trusted pair of eyes in the saleroom" />
        <div className="grid grid--features">
          {features.map((feature) => (
            <FeatureTile key={feature.title} icon={feature.icon} title={feature.title}>
              {feature.text}
            </FeatureTile>
          ))}
        </div>
      </div>
    </section>
  )
}
