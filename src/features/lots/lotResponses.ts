// Checks lot responses against the API contract (backend src/api/lots and /api/auctions/:id/lots).
import type { Page } from '../../services/pagination'
import {
  contractError,
  list,
  nested,
  nullableMatching,
  nullableText,
  record,
  text,
  textList,
  type Fields,
} from '../../services/responseFields'
import { httpsPattern, pageOf, parseAuctionSummary } from '../auctions/auctionResponses'
import type { Lot, LotSummary, LotWithAuction } from './types'

/** Estimates arrive as exact decimal strings ("1500.00") */
function nullableAmount(fields: Fields, key: string): number | null {
  const value = nullableText(fields, key)
  if (value === null) {
    return null
  }
  const amount = Number(value)
  if (value.trim() === '' || !Number.isFinite(amount)) {
    throw contractError()
  }
  return amount
}

/**
 * A three-letter currency code such as "EUR". The monitor copies it from other websites, so anything
 * else is left out rather than breaking how estimates are formatted.
 */
function nullableCurrency(fields: Fields, key: string): string | null {
  const value = nullableText(fields, key)?.trim().toUpperCase() ?? ''
  return /^[A-Z]{3}$/.test(value) ? value : null
}

export function parseLot(value: unknown): Lot {
  const fields = record(value)
  return {
    id: text(fields, 'id'),
    auctionId: text(fields, 'auctionId'),
    externalId: text(fields, 'externalId'),
    lotNumber: nullableText(fields, 'lotNumber'),
    title: nullableText(fields, 'title'),
    description: nullableText(fields, 'description'),
    category: nullableText(fields, 'category'),
    maker: nullableText(fields, 'maker'),
    materials: textList(fields, 'materials'),
    estimateLow: nullableAmount(fields, 'estimateLow'),
    estimateHigh: nullableAmount(fields, 'estimateHigh'),
    currency: nullableCurrency(fields, 'currency'),
    imageUrl: nullableMatching(fields, 'imageUrl', httpsPattern),
    sourceUrl: nullableMatching(fields, 'sourceUrl', httpsPattern),
    titleUk: nullableText(fields, 'titleUk'),
    descriptionUk: nullableText(fields, 'descriptionUk'),
    aiCategory: nullableText(fields, 'aiCategory'),
    aiSummary: nullableText(fields, 'aiSummary'),
  }
}

export function parseLotWithAuction(value: unknown): LotWithAuction {
  return { ...parseLot(value), auction: parseAuctionSummary(nested(record(value), 'auction')) }
}

/** { lots, total, limit, offset } */
export function parseLotPage(data: unknown): Page<LotWithAuction> {
  return pageOf(data, 'lots', parseLotWithAuction)
}

export function parseLotSummary(value: unknown): LotSummary {
  const fields = record(value)
  return {
    id: text(fields, 'id'),
    lotNumber: nullableText(fields, 'lotNumber'),
    title: nullableText(fields, 'title'),
    titleUk: nullableText(fields, 'titleUk'),
  }
}

/** { lots }: every lot of one sale */
export function parseLotSummaries(data: unknown): LotSummary[] {
  return list(data, 'lots').map(parseLotSummary)
}
