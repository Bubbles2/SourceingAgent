import { use } from 'react'
import { ArrowLeft, MapPin } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { auctionPath, editAuctionPath, editCataloguePath, newCataloguePath, paths, reviewRequestsPath } from '../../app/paths'
import { PageContainer } from '../../components/layout/PageContainer'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice } from '../../components/ui/Notice'
import { formatLotCount, formatSaleDateLong, formatViewingRange } from '../auctions/formatAuction'
import type { AuctionWithCatalogues } from '../auctions/types'
import { PdfLink } from '../catalogues/PdfLink'
import { AuctionStatusActions } from './AuctionStatusActions'
import { AuctionStatusBadge } from './AuctionStatusBadge'
import { readFlash } from './flash'
import '../../components/ui/Table.css'
import './AdminTables.css'
import './AdminAuctionDetails.css'

function BackToAuctions(): React.JSX.Element {
  return (
    <ButtonLink variant="link" to={paths.adminAuctions}>
      <ArrowLeft size={16} />
      Auctions
    </ButtonLink>
  )
}

/** A sale as the agent manages it: its status, details and catalogues. */
export function AdminAuctionDetails({ auction: auctionPromise }: { auction: Promise<AuctionWithCatalogues | null> }): React.JSX.Element {
  const auction = use(auctionPromise)
  const flash = readFlash(useLocation().state)

  if (!auction) {
    return (
      <PageContainer breadcrumb={<BackToAuctions />} eyebrow="Administration" title="Auction not found">
        <EmptyState title="There is no sale at this address" actions={<ButtonLink to={paths.adminAuctions}>All auctions</ButtonLink>}>
          It may have been deleted, or the link may be mistyped.
        </EmptyState>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      breadcrumb={<BackToAuctions />}
      eyebrow={auction.category}
      title={auction.title}
      description={
        <span className="admin-detail__house">
          <MapPin size={18} />
          {`${auction.house} · ${auction.city}`}
        </span>
      }
    >
      {flash ? (
        <Notice tone="success" title="Saved.">
          {flash}
        </Notice>
      ) : null}

      <div className="admin-detail__toolbar">
        <AuctionStatusBadge status={auction.status} />
        <div className="admin-detail__actions">
          <ButtonLink to={editAuctionPath(auction.id)} variant="secondary">
            Edit details
          </ButtonLink>
          <AuctionStatusActions auction={auction} />
        </div>
      </div>

      <dl className="admin-detail__facts">
        <div>
          <dt>Sale</dt>
          <dd>{`${formatSaleDateLong(auction.saleDate)} at ${auction.saleTime}, Paris time`}</dd>
        </div>
        <div>
          <dt>Viewing</dt>
          <dd>{auction.viewing ? formatViewingRange(auction.viewing) : 'Not announced yet'}</dd>
        </div>
        <div>
          <dt>Lots</dt>
          <dd>{auction.lotCount === null ? 'Not known yet' : formatLotCount(auction.lotCount)}</dd>
        </div>
        <div>
          <dt>Home page</dt>
          <dd>{auction.featured ? 'Featured' : 'Not featured'}</dd>
        </div>
        <div>
          <dt>On the website</dt>
          <dd>
            {auction.status === 'published' ? (
              <Link to={auctionPath(auction.id)}>{`/auctions/${auction.id}`}</Link>
            ) : (
              `Hidden while ${auction.status === 'draft' ? 'a draft' : 'cancelled'}`
            )}
          </dd>
        </div>
        <div>
          <dt>Bid requests</dt>
          <dd>
            <Link to={reviewRequestsPath({ view: 'all', auction: auction.id })}>See every request for this sale</Link>
          </dd>
        </div>
      </dl>

      <section className="admin-detail__section" aria-labelledby="admin-auction-about">
        <h2 id="admin-auction-about" className="admin-detail__heading">
          Description
        </h2>
        <p className="admin-detail__description">{auction.description}</p>
        {auction.image ? <img className="admin-detail__image" src={auction.image.src} alt={auction.image.alt} /> : null}
      </section>

      <section className="admin-detail__section" aria-labelledby="admin-auction-catalogues">
        <div className="admin-detail__section-head">
          <h2 id="admin-auction-catalogues" className="admin-detail__heading">
            Catalogues
          </h2>
          <ButtonLink to={newCataloguePath(auction.id)} variant="secondary">
            Add catalogue
          </ButtonLink>
        </div>
        {auction.catalogues.length > 0 ? (
          <div className="table-wrap">
            <table className="table admin-table">
              <caption className="visually-hidden">{`Catalogues for ${auction.title}`}</caption>
              <thead>
                <tr>
                  <th scope="col">Catalogue</th>
                  <th scope="col" className="num">
                    Lots
                  </th>
                  <th scope="col" className="num">
                    Pages
                  </th>
                  <th scope="col">PDF</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {auction.catalogues.map((catalogue) => (
                  <tr key={catalogue.id}>
                    <td>
                      <span className="table__primary">{catalogue.title}</span>
                      <span className="table__secondary">{catalogue.id}</span>
                    </td>
                    <td className="num">{`${catalogue.lots.first}–${catalogue.lots.last}`}</td>
                    <td className="num">{catalogue.pageCount ?? '—'}</td>
                    <td>
                      <PdfLink href={catalogue.pdfUrl} label="Open PDF" context={catalogue.title} />
                    </td>
                    <td className="admin-table__actions">
                      <ButtonLink to={editCataloguePath(catalogue.id)} size="sm" variant="secondary" aria-label={`Edit ${catalogue.title}`}>
                        Edit
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No catalogue yet">
            Add the auction house's PDF catalogue so customers can find their lots and request bids.
          </EmptyState>
        )}
      </section>
    </PageContainer>
  )
}
