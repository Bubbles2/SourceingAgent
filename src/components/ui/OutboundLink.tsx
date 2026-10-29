import { ExternalLink } from 'lucide-react'
import { ButtonLink } from './Button'

type OutboundLinkProps = {
  href: string
  label: string
  /** What the link belongs to, so repeated labels stay distinguishable for screen readers */
  context: string
}

/** A link to another website, such as an auction house's catalogue; always opens in a new tab. */
export function OutboundLink({ href, label, context }: OutboundLinkProps): React.JSX.Element {
  return (
    <ButtonLink
      variant="link"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label} for ${context} (opens in a new tab)`}
    >
      <ExternalLink size={16} />
      {label}
    </ButtonLink>
  )
}
