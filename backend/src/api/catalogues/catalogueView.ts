// Catalogues as the API returns them: public ids (slugs) only, never database keys.
import type { AuctionStatus } from '../../repositories/auctionsRepository.ts'
import type { CatalogueRecord } from '../../repositories/cataloguesRepository.ts'

export type CatalogueView = {
  id: string
  /** The sale's public id */
  auctionId: string
  title: string
  description: string
  lots: { first: number; last: number }
  pageCount: number | null
  pdfUrl: string
  cover: { src: string; alt: string } | null
}

export type AuctionSummaryView = {
  id: string
  title: string
  house: string
  city: string
  saleDate: string
  saleTime: string
  status: AuctionStatus
}

export type CatalogueWithAuctionView = CatalogueView & {
  auction: AuctionSummaryView
}

export function toCatalogueView(catalogue: CatalogueRecord): CatalogueView {
  return {
    id: catalogue.slug,
    auctionId: catalogue.auction.slug,
    title: catalogue.title,
    description: catalogue.description,
    lots: catalogue.lots,
    pageCount: catalogue.pageCount,
    pdfUrl: catalogue.pdfUrl,
    cover: catalogue.cover,
  }
}

export function toCatalogueWithAuctionView(catalogue: CatalogueRecord): CatalogueWithAuctionView {
  const { slug, title, house, city, saleDate, saleTime, status } = catalogue.auction
  return { ...toCatalogueView(catalogue), auction: { id: slug, title, house, city, saleDate, saleTime, status } }
}
