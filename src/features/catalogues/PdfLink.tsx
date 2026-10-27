import { FileIcon } from 'lucide-react'
import { ButtonLink } from '../../components/ui/Button'

type PdfLinkProps = {
  href: string
  label: string
  /** What the PDF belongs to, so repeated labels stay distinguishable for screen readers */
  context: string
}

/** External catalogue PDF; always opens in a new tab. */
export function PdfLink({ href, label, context }: PdfLinkProps): React.JSX.Element {
  const accessibleName = /\bPDF\b/.test(label)
    ? `${label} for ${context}, opens in a new tab`
    : `${label} for ${context} (PDF, opens in a new tab)`

  return (
    <ButtonLink variant="link" href={href} target="_blank" rel="noreferrer" aria-label={accessibleName}>
      <FileIcon size={16} />
      {label}
    </ButtonLink>
  )
}
