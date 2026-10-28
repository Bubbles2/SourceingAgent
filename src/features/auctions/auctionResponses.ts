// Checks auction and catalogue responses against the API contract (backend src/api/auctions and
// src/api/catalogues).
import type { Page } from '../../services/pagination'
import {
  boolean,
  integer,
  list,
  matching,
  nested,
  nullableInteger,
  nullableNested,
  oneOf,
  record,
  text,
  type Fields,
} from '../../services/responseFields'
import type { ImageAsset } from '../../types/media'
import {
  auctionStatuses,
  type AuctionSummary,
  type AuctionWithCatalogues,
  type Catalogue,
  type CatalogueWithAuction,
} from './types'

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const time = /^\d{2}:\d{2}$/

function image(fields: Fields, key: string): ImageAsset | null {
  const value = nullableNested(fields, key)
  return value ? { src: text(value, 'src'), alt: text(value, 'alt') } : null
}

function pageOf<Item>(data: unknown, key: string, parseItem: (value: unknown) => Item): Page<Item> {
  const fields = record(data)
  return {
    items: list(fields, key).map(parseItem),
    total: integer(fields, 'total'),
    limit: integer(fields, 'limit'),
    offset: integer(fields, 'offset'),
  }
}

export function parseCatalogue(value: unknown): Catalogue {
  const fields = record(value)
  const lots = nested(fields, 'lots')
  return {
    id: text(fields, 'id'),
    auctionId: text(fields, 'auctionId'),
    title: text(fields, 'title'),
    description: text(fields, 'description'),
    lots: { first: integer(lots, 'first'), last: integer(lots, 'last') },
    pageCount: nullableInteger(fields, 'pageCount'),
    pdfUrl: matching(fields, 'pdfUrl', /^https:\/\//),
    cover: image(fields, 'cover'),
  }
}

export function parseAuction(value: unknown): AuctionWithCatalogues {
  const fields = record(value)
  const viewing = nullableNested(fields, 'viewing')
  return {
    id: text(fields, 'id'),
    title: text(fields, 'title'),
    category: text(fields, 'category'),
    house: text(fields, 'house'),
    city: text(fields, 'city'),
    saleDate: matching(fields, 'saleDate', isoDate),
    saleTime: matching(fields, 'saleTime', time),
    lotCount: nullableInteger(fields, 'lotCount'),
    viewing: viewing ? { start: matching(viewing, 'start', isoDate), end: matching(viewing, 'end', isoDate) } : null,
    description: text(fields, 'description'),
    image: image(fields, 'image'),
    featured: boolean(fields, 'featured'),
    status: oneOf(fields, 'status', auctionStatuses),
    catalogues: list(fields, 'catalogues').map(parseCatalogue),
  }
}

function parseAuctionSummary(value: unknown): AuctionSummary {
  const fields = record(value)
  return {
    id: text(fields, 'id'),
    title: text(fields, 'title'),
    house: text(fields, 'house'),
    city: text(fields, 'city'),
    saleDate: matching(fields, 'saleDate', isoDate),
    saleTime: matching(fields, 'saleTime', time),
  }
}

export function parseCatalogueWithAuction(value: unknown): CatalogueWithAuction {
  return { ...parseCatalogue(value), auction: parseAuctionSummary(nested(record(value), 'auction')) }
}

/** { auctions, total, limit, offset } */
export function parseAuctionPage(data: unknown): Page<AuctionWithCatalogues> {
  return pageOf(data, 'auctions', parseAuction)
}

/** { auction } */
export function parseAuctionResponse(data: unknown): AuctionWithCatalogues {
  return parseAuction(nested(record(data), 'auction'))
}

/** { catalogues, total, limit, offset } */
export function parseCataloguePage(data: unknown): Page<CatalogueWithAuction> {
  return pageOf(data, 'catalogues', parseCatalogueWithAuction)
}
