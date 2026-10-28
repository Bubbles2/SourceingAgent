// Sales as the API returns them: public ids (slugs) only, never database keys.
import type { AuctionFields, AuctionRecord } from '../../repositories/auctionsRepository.ts'
import type { CatalogueRecord } from '../../repositories/cataloguesRepository.ts'
import { toCatalogueView, type CatalogueView } from '../catalogues/catalogueView.ts'

export type AuctionView = AuctionFields & {
  id: string
  catalogues: CatalogueView[]
}

export function toAuctionView({ id: _databaseId, slug, ...fields }: AuctionRecord, catalogues: readonly CatalogueRecord[]): AuctionView {
  return { id: slug, ...fields, catalogues: catalogues.map(toCatalogueView) }
}
