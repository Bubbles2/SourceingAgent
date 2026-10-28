// The catalogue form's values and checks, matching the API's (backend src/api/catalogues).
import type { FormValidation } from '../../components/form/useValidatedForm'
import { isHttpsUrl, isSitePath, slugify, slugPattern } from '../../utils/links'
import type { AuctionWithCatalogues, CatalogueWithAuction } from '../auctions/types'
import type { CatalogueFields } from './adminCatalogueService'

export type CatalogueFormValues = {
  /** The catalogue's id; suggested from the title when left empty */
  id: string
  auctionId: string
  title: string
  description: string
  firstLot: string
  lastLot: string
  pageCount: string
  pdfUrl: string
  coverUrl: string
  coverAlt: string
}

export type CatalogueFormInput = {
  id: string
  fields: CatalogueFields
}

export const catalogueTextLimits = { title: 200, description: 5000, pdfUrl: 2048, coverAlt: 300 } as const
const maxLotNumber = 100_000
const maxPageCount = 10_000

export function emptyCatalogueValues(auctionId = ''): CatalogueFormValues {
  return {
    id: '',
    auctionId,
    title: '',
    description: '',
    firstLot: '1',
    lastLot: '',
    pageCount: '',
    pdfUrl: '',
    coverUrl: '',
    coverAlt: '',
  }
}

export function catalogueValuesFrom(catalogue: CatalogueWithAuction): CatalogueFormValues {
  return {
    id: catalogue.id,
    auctionId: catalogue.auctionId,
    title: catalogue.title,
    description: catalogue.description,
    firstLot: String(catalogue.lots.first),
    lastLot: String(catalogue.lots.last),
    pageCount: catalogue.pageCount === null ? '' : String(catalogue.pageCount),
    pdfUrl: catalogue.pdfUrl,
    coverUrl: catalogue.cover?.src ?? '',
    coverAlt: catalogue.cover?.alt ?? '',
  }
}

export function suggestCatalogueId(title: string): string {
  return slugify(title).slice(0, 120).replace(/-+$/, '')
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
}

type ValidationOptions = {
  mode: 'create' | 'edit'
  /** The sales to choose from, so the lot range can be checked against the chosen one */
  auctions: readonly AuctionWithCatalogues[]
}

export function validateCatalogueForm(
  values: CatalogueFormValues,
  { mode, auctions }: ValidationOptions,
): FormValidation<CatalogueFormValues, CatalogueFormInput> {
  const errors: FormValidation<CatalogueFormValues, CatalogueFormInput>['errors'] = {}
  const title = values.title.trim()
  const description = values.description.trim()
  const pdfUrl = values.pdfUrl.trim()
  const coverUrl = values.coverUrl.trim()
  const coverAlt = values.coverAlt.trim()

  const auction = auctions.find((candidate) => candidate.id === values.auctionId)
  if (!values.auctionId) {
    errors.auctionId = 'Choose the sale this catalogue belongs to.'
  } else if (!auction) {
    errors.auctionId = 'This sale no longer exists. Choose another.'
  }

  if (!title) {
    errors.title = 'Enter the catalogue title.'
  } else if (title.length > catalogueTextLimits.title) {
    errors.title = `Keep this to ${catalogueTextLimits.title} characters or fewer.`
  }
  if (description.length > catalogueTextLimits.description) {
    errors.description = 'Keep this to 5,000 characters or fewer.'
  }

  const id = mode === 'create' ? values.id.trim() || suggestCatalogueId(title) : values.id
  if (mode === 'create' && values.id.trim() && (!slugPattern.test(id) || id.length > 120)) {
    errors.id = 'Use lower-case letters, digits and hyphens only, such as vauclair-tableaux-anciens.'
  }

  const firstLot = wholeNumber(values.firstLot)
  const lastLot = wholeNumber(values.lastLot)
  if (firstLot === null || firstLot < 1 || firstLot > maxLotNumber) {
    errors.firstLot = 'Enter the first lot number as a whole number from 1 to 100,000.'
  }
  if (lastLot === null || lastLot < 1 || lastLot > maxLotNumber) {
    errors.lastLot = 'Enter the last lot number as a whole number from 1 to 100,000.'
  } else if (firstLot !== null && lastLot < firstLot) {
    errors.lastLot = 'The last lot must be the same as or after the first lot.'
  } else if (auction?.lotCount != null && lastLot > auction.lotCount) {
    errors.lastLot = `This sale has ${auction.lotCount} lots, so the last lot can't be above ${auction.lotCount}.`
  }

  const pageCount = wholeNumber(values.pageCount)
  if (values.pageCount.trim() && (pageCount === null || pageCount < 1 || pageCount > maxPageCount)) {
    errors.pageCount = 'Enter the number of pages as a whole number from 1 to 10,000.'
  }

  if (!pdfUrl || !isHttpsUrl(pdfUrl) || pdfUrl.length > catalogueTextLimits.pdfUrl) {
    errors.pdfUrl = 'Enter the full https:// address of the PDF published by the auction house.'
  }

  if (coverUrl && !isHttpsUrl(coverUrl) && !isSitePath(coverUrl)) {
    errors.coverUrl = 'Use an https:// address or a path on this site, such as /images/cover.jpg.'
  }
  if (coverUrl && !coverAlt) {
    errors.coverAlt = "Describe the cover for people who can't see it."
  } else if (coverAlt.length > catalogueTextLimits.coverAlt) {
    errors.coverAlt = `Keep this to ${catalogueTextLimits.coverAlt} characters or fewer.`
  }

  if (Object.keys(errors).length > 0 || firstLot === null || lastLot === null) {
    return { errors, input: null }
  }
  return {
    errors: {},
    input: {
      id,
      fields: {
        auctionId: values.auctionId,
        title,
        description,
        lots: { first: firstLot, last: lastLot },
        pageCount: values.pageCount.trim() ? pageCount : null,
        pdfUrl,
        cover: coverUrl ? { src: coverUrl, alt: coverAlt } : null,
      },
    },
  }
}
