import { SectionHeading } from './SectionHeading'
import { StepTile } from './StepTile'
import './landing.css'

const steps = [
  {
    title: 'Discover auctions',
    text: 'Browse upcoming sales by date, auction house and location, or open the monthly calendar.',
  },
  {
    title: 'Browse the lots',
    text: "Every sale's lots, with the auction house's photos and descriptions, so you can study each one.",
  },
  {
    title: 'Request a bid',
    text: 'Pick the auction and the lot, enter your maximum bid in EUR and add any instructions.',
  },
  {
    title: 'The agent bids for you',
    text: 'Once accepted, your request reserves the lot. The agent bids in the room and reports the result.',
  },
] as const

export function HowItWorks(): React.JSX.Element {
  return (
    <section id="how" className="section section--white" aria-labelledby="how-title">
      <div className="container landing-stack">
        <SectionHeading id="how-title" eyebrow="How it works" title="Four steps from lot to hammer" />
        <ol className="grid grid--steps landing-list">
          {steps.map((step, index) => (
            <StepTile key={step.title} step={index + 1} title={step.title}>
              {step.text}
            </StepTile>
          ))}
        </ol>
      </div>
    </section>
  )
}
