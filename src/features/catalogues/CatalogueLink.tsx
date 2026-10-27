import { FileIcon } from 'lucide-react'
import { auctionCataloguesId, auctionPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import type { AuctionWithCatalogues } from '../auctions/types'
import { PdfLink } from './PdfLink'
import './CatalogueLink.css'

type CatalogueLinkProps = {
  auction: Pick<AuctionWithCatalogues, 'id' | 'title' | 'catalogues'>
  /** Label when the sale has a single catalogue, e.g. "View catalogue" */
  label: string
}

/** One catalogue opens its PDF; several link to the auction's catalogue list; none shows a notice. */
export function CatalogueLink({ auction, label }: CatalogueLinkProps): React.JSX.Element {
  const [firstCatalogue] = auction.catalogues

  if (!firstCatalogue) {
    return (
      <span className="catalogue-link-pending">
        <FileIcon size={16} />
        Catalogue coming soon
      </span>
    )
  }

  if (auction.catalogues.length === 1) {
    return <PdfLink href={firstCatalogue.pdfUrl} label={label} context={auction.title} />
  }

  return (
    <ButtonLink
      variant="link"
      to={{ pathname: auctionPath(auction.id), hash: auctionCataloguesId }}
      aria-label={`View ${auction.catalogues.length} catalogues for ${auction.title}`}
    >
      <FileIcon size={16} />
      {`View catalogues (${auction.catalogues.length})`}
    </ButtonLink>
  )
}
