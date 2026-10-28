// The auction form's values and checks. They match the API's (backend src/api/auctions), so an
// administrator sees the same messages either way; the API has the final word.
import type { FormValidation } from '../../components/form/useValidatedForm'
import { isHttpsUrl, isSitePath, slugify, slugPattern } from '../../utils/links'
import { todayInParis } from '../auctions/saleStatus'
import type { Auction } from '../auctions/types'
import type { AuctionFields } from './adminAuctionService'

export type AuctionFormValues = {
  /** The sale's address on the site; suggested from the title and month when left empty */
  id: string
  title: string
  category: string
  house: string
  city: string
  saleDate: string
  saleTime: string
  lotCount: string
  viewingStart: string
  viewingEnd: string
  description: string
  imageUrl: string
  imageAlt: string
  featured: boolean
  status: 'draft' | 'published'
}

export type AuctionFormInput = {
  id: string
  status: 'draft' | 'published'
  fields: AuctionFields
}

export const auctionTextLimits = { title: 200, category: 100, house: 200, city: 100, description: 5000, imageAlt: 300 } as const
/** How far ahead a sale can be scheduled, which catches mistyped years */
const maxYearsAhead = 5
const maxLotCount = 100_000

/** A blank form; a sale date chosen on the calendar is filled in. */
export function emptyAuctionValues(saleDate = ''): AuctionFormValues {
  return {
    id: '',
    title: '',
    category: '',
    house: '',
    city: '',
    saleDate,
    saleTime: '',
    lotCount: '',
    viewingStart: '',
    viewingEnd: '',
    description: '',
    imageUrl: '',
    imageAlt: '',
    featured: false,
    status: 'draft',
  }
}

/** The form filled in from a sale, for editing */
export function auctionValuesFrom(auction: Auction): AuctionFormValues {
  return {
    id: auction.id,
    title: auction.title,
    category: auction.category,
    house: auction.house,
    city: auction.city,
    saleDate: auction.saleDate,
    saleTime: auction.saleTime,
    lotCount: auction.lotCount === null ? '' : String(auction.lotCount),
    viewingStart: auction.viewing?.start ?? '',
    viewingEnd: auction.viewing?.end ?? '',
    description: auction.description,
    imageUrl: auction.image?.src ?? '',
    imageAlt: auction.image?.alt ?? '',
    featured: auction.featured,
    status: auction.status === 'published' ? 'published' : 'draft',
  }
}

/** "tableaux-anciens-dessins-2026-11" from the title and the sale's month */
export function suggestAuctionId(title: string, saleDate: string): string {
  const month = /^\d{4}-\d{2}/.test(saleDate) ? saleDate.slice(0, 7) : ''
  return [slugify(title).slice(0, 110).replace(/-+$/, ''), month].filter(Boolean).join('-')
}

/** A real calendar date written YYYY-MM-DD */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function addYears(isoDate: string, years: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return date.toISOString().slice(0, 10)
}

type ValidationOptions = {
  mode: 'create' | 'edit'
  /** The stored sale date when editing: a completed sale can be corrected without moving it */
  originalSaleDate?: string
  today?: string
}

export function validateAuctionForm(
  values: AuctionFormValues,
  { mode, originalSaleDate, today = todayInParis() }: ValidationOptions,
): FormValidation<AuctionFormValues, AuctionFormInput> {
  const errors: FormValidation<AuctionFormValues, AuctionFormInput>['errors'] = {}
  const text = {
    title: values.title.trim(),
    category: values.category.trim(),
    house: values.house.trim(),
    city: values.city.trim(),
    description: values.description.trim(),
    imageUrl: values.imageUrl.trim(),
    imageAlt: values.imageAlt.trim(),
  }

  const required: [keyof typeof auctionTextLimits & keyof typeof text, string][] = [
    ['title', 'Enter the title of the sale.'],
    ['category', 'Enter a category, such as Fine art.'],
    ['house', 'Enter the auction house.'],
    ['city', 'Enter the city or district, such as Paris 9e.'],
    ['description', 'Describe the sale.'],
  ]
  for (const [field, message] of required) {
    if (!text[field]) {
      errors[field] = message
    } else if (text[field].length > auctionTextLimits[field]) {
      errors[field] = `Keep this to ${auctionTextLimits[field].toLocaleString('en-GB')} characters or fewer.`
    }
  }

  const id = mode === 'create' ? values.id.trim() || suggestAuctionId(text.title, values.saleDate) : values.id
  if (mode === 'create' && values.id.trim() && (!slugPattern.test(id) || id.length > 120)) {
    errors.id = 'Use lower-case letters, digits and hyphens only, such as vauclair-tableaux-anciens-2026-11.'
  }

  if (!values.saleDate) {
    errors.saleDate = 'Enter the sale date.'
  } else if (!isIsoDate(values.saleDate)) {
    errors.saleDate = 'Enter the sale date as a real date.'
  } else if ((mode === 'create' || values.saleDate !== originalSaleDate) && values.saleDate < today) {
    errors.saleDate = "The sale date can't be in the past."
  } else if (values.saleDate > addYears(today, maxYearsAhead)) {
    errors.saleDate = `The sale date must be within the next ${maxYearsAhead} years.`
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.saleTime)) {
    errors.saleTime = 'Enter the sale time in 24-hour Paris time, such as 14:30.'
  }

  const lotText = values.lotCount.trim()
  const lotCount = /^\d+$/.test(lotText) ? Number(lotText) : null
  if (lotText && (lotCount === null || lotCount < 1 || lotCount > maxLotCount)) {
    errors.lotCount = 'Enter the number of lots as a whole number from 1 to 100,000.'
  }

  const { viewingStart, viewingEnd } = values
  if (Boolean(viewingStart) !== Boolean(viewingEnd)) {
    errors[viewingStart ? 'viewingEnd' : 'viewingStart'] = 'Enter both viewing days, or neither.'
  } else if (viewingStart && viewingEnd) {
    if (!isIsoDate(viewingStart)) {
      errors.viewingStart = 'Enter the first viewing day as a real date.'
    } else if (!isIsoDate(viewingEnd)) {
      errors.viewingEnd = 'Enter the last viewing day as a real date.'
    } else if (viewingEnd < viewingStart) {
      errors.viewingEnd = 'Viewing must end on or after the day it starts.'
    } else if (isIsoDate(values.saleDate) && viewingEnd > values.saleDate) {
      errors.viewingEnd = 'Viewing must end on or before the sale date.'
    }
  }

  if (text.imageUrl && !isHttpsUrl(text.imageUrl) && !isSitePath(text.imageUrl)) {
    errors.imageUrl = 'Use an https:// address or a path on this site, such as /images/sale.jpg.'
  }
  if (text.imageUrl && !text.imageAlt) {
    errors.imageAlt = "Describe the image for people who can't see it."
  } else if (text.imageAlt.length > auctionTextLimits.imageAlt) {
    errors.imageAlt = `Keep this to ${auctionTextLimits.imageAlt} characters or fewer.`
  }

  if (Object.keys(errors).length > 0) {
    return { errors, input: null }
  }
  return {
    errors: {},
    input: {
      id,
      status: values.status,
      fields: {
        title: text.title,
        category: text.category,
        house: text.house,
        city: text.city,
        saleDate: values.saleDate,
        saleTime: values.saleTime,
        lotCount,
        viewing: viewingStart && viewingEnd ? { start: viewingStart, end: viewingEnd } : null,
        description: text.description,
        image: text.imageUrl ? { src: text.imageUrl, alt: text.imageAlt } : null,
        featured: values.featured,
      },
    },
  }
}
