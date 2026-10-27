import { Notice } from '../../components/ui/Notice'

export const pricingNoticeText =
  "Your maximum bid represents the maximum hammer price you authorise the sourcing agent to bid. It excludes auctioneer fees, buyer's premiums, taxes, shipping, transport, insurance, and sourcing-agent charges."

type PricingNoticeProps = {
  id?: string
}

/** The charges notice customers must acknowledge before requesting a bid (DESIGN.md §6.6). */
export function PricingNotice({ id }: PricingNoticeProps): React.JSX.Element {
  return (
    <Notice id={id} title="What your maximum bid covers.">
      {pricingNoticeText}
    </Notice>
  )
}
