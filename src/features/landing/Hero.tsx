import { ButtonLink } from '../../components/ui/Button'
import './Hero.css'

export function Hero(): React.JSX.Element {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__inner">
        <div className="hero__panel">
          <p className="eyebrow hero__eyebrow">Paris-based bidding agent · International buyers</p>
          <h1 id="hero-title">Bid at Parisien auctions, without leaving home.</h1>
          <p className="lead">
            Discover upcoming sales across Paris, browse the catalogues, and ask our Paris-based agent to bid on the
            lots you want — on your behalf, up to your maximum price.
          </p>
          <div className="hero__actions">
            <ButtonLink href="#auctions" size="lg">
              Browse upcoming auctions
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </div>
          <p className="hero__note">
            No live bidding happens here. You send a request; the agent reviews it and bids for you in the saleroom.
          </p>
        </div>
      </div>
    </section>
  )
}
