import { Notice } from '../../components/ui/Notice'

type FeesNoticeProps = {
  id?: string
}

/** Mandatory notice wherever a maximum bid is discussed or entered (DESIGN.md §6.6). */
export function FeesNotice({ id }: FeesNoticeProps): React.JSX.Element {
  return (
    <Notice id={id} title="About maximum bids.">
      The maximum bid you enter is the hammer price only. It excludes the auctioneer's fees, taxes, the agent's fee,
      shipping and transport, which are invoiced separately after a successful bid.
    </Notice>
  )
}
