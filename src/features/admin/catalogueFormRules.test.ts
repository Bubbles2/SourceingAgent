import { describe, expect, it } from 'vitest'
import type { AuctionWithCatalogues } from '../auctions/types'
import { emptyCatalogueValues, suggestCatalogueId, validateCatalogueForm, type CatalogueFormValues } from './catalogueFormRules'

const sale: AuctionWithCatalogues = {
  id: 'verrerie-2026-12',
  title: 'Verrerie',
  category: 'Glass',
  house: 'Maison Test',
  city: 'Paris',
  saleDate: '2026-12-07',
  saleTime: '15:00',
  lotCount: 120,
  viewing: null,
  description: '',
  image: null,
  featured: false,
  status: 'draft',
  catalogues: [],
}

const valid: CatalogueFormValues = {
  ...emptyCatalogueValues('verrerie-2026-12'),
  title: ' Verres & cristaux ',
  lastLot: '120',
  pageCount: '64',
  pdfUrl: ' https://example.com/catalogues/verres.pdf ',
}

function errorsOf(values: Partial<CatalogueFormValues>) {
  return validateCatalogueForm({ ...valid, ...values }, { mode: 'create', auctions: [sale] }).errors
}

describe('catalogue form', () => {
  it('starts with its sale chosen and lot 1 first', () => {
    expect(emptyCatalogueValues('verrerie-2026-12')).toMatchObject({ auctionId: 'verrerie-2026-12', firstLot: '1' })
  })

  it('turns a valid form into what the API expects', () => {
    expect(validateCatalogueForm(valid, { mode: 'create', auctions: [sale] })).toEqual({
      errors: {},
      input: {
        id: 'verres-cristaux',
        fields: {
          auctionId: 'verrerie-2026-12',
          title: 'Verres & cristaux',
          description: '',
          lots: { first: 1, last: 120 },
          pageCount: 64,
          pdfUrl: 'https://example.com/catalogues/verres.pdf',
          cover: null,
        },
      },
    })
  })

  it.each([
    [{ auctionId: '' }, 'auctionId', 'Choose the sale this catalogue belongs to.'],
    [{ auctionId: 'deleted-sale' }, 'auctionId', 'This sale no longer exists. Choose another.'],
    [{ title: '' }, 'title', 'Enter the catalogue title.'],
    [{ firstLot: '0' }, 'firstLot', 'Enter the first lot number as a whole number from 1 to 100,000.'],
    [{ firstLot: '50', lastLot: '40' }, 'lastLot', 'The last lot must be the same as or after the first lot.'],
    [{ lastLot: '121' }, 'lastLot', "This sale has 120 lots, so the last lot can't be above 120."],
    [{ pageCount: 'many' }, 'pageCount', 'Enter the number of pages as a whole number from 1 to 10,000.'],
    [{ pdfUrl: '' }, 'pdfUrl', 'Enter the full https:// address of the PDF published by the auction house.'],
    [{ pdfUrl: 'http://example.com/c.pdf' }, 'pdfUrl', 'Enter the full https:// address of the PDF published by the auction house.'],
    [{ pdfUrl: 'javascript:alert(1)' }, 'pdfUrl', 'Enter the full https:// address of the PDF published by the auction house.'],
    [{ coverUrl: '/images/cover.jpg' }, 'coverAlt', "Describe the cover for people who can't see it."],
    [{ id: 'Bad id' }, 'id', 'Use lower-case letters, digits and hyphens only, such as vauclair-tableaux-anciens.'],
  ])('refuses %o', (values, field, message) => {
    expect(errorsOf(values)).toEqual({ [field]: message })
  })

  it('suggests an id from the title', () => {
    expect(suggestCatalogueId("Cave d'un château du Médoc")).toBe('cave-d-un-chateau-du-medoc')
  })
})
