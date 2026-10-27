import { SectionHeading } from './SectionHeading'
import { StepTile } from './StepTile'
import './landing.css'

const steps = [
  {
    title: 'Discover auctions',
    text: 'Browse upcoming sales by date, auction house and location, or open the monthly calendar.',
  },
  {
    title: 'Read the catalogue',
    text: "Each auction links to the house's official PDF catalogue so you can study every lot.",
  },
  {
    title: 'Request a bid',
    text: 'Pick the auction and catalogue, enter the lot number and your maximum bid in EUR, add instructions.',
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
        <SectionHeading id="how-title" eyebrow="How it works" title="Four steps from catalogue to hammer" />
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
