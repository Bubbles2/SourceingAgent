import { describe, expect, it } from 'vitest'
import { emptyAuctionValues, isIsoDate, suggestAuctionId, validateAuctionForm, type AuctionFormValues } from './auctionFormRules'

const today = '2026-10-28'

const valid: AuctionFormValues = {
  ...emptyAuctionValues('2026-12-07'),
  title: '  Verrerie Art Nouveau  ',
  category: 'Glass',
  house: 'Maison Test',
  city: 'Paris 7e',
  saleTime: '15:00',
  lotCount: '120',
  viewingStart: '2026-12-05',
  viewingEnd: '2026-12-06',
  description: 'Glass from a private collection.',
  status: 'published',
}

function errorsOf(values: Partial<AuctionFormValues>, mode: 'create' | 'edit' = 'create', originalSaleDate?: string) {
  return validateAuctionForm({ ...valid, ...values }, { mode, originalSaleDate, today }).errors
}

describe('auction form', () => {
  it('starts with the date chosen on the calendar', () => {
    expect(emptyAuctionValues('2026-12-07').saleDate).toBe('2026-12-07')
    expect(emptyAuctionValues().status).toBe('draft')
  })

  it('turns a valid form into what the API expects, trimmed, with the id suggested', () => {
    expect(validateAuctionForm(valid, { mode: 'create', today })).toEqual({
      errors: {},
      input: {
        id: 'verrerie-art-nouveau-2026-12',
        status: 'published',
        fields: {
          title: 'Verrerie Art Nouveau',
          category: 'Glass',
          house: 'Maison Test',
          city: 'Paris 7e',
          saleDate: '2026-12-07',
          saleTime: '15:00',
          lotCount: 120,
          viewing: { start: '2026-12-05', end: '2026-12-06' },
          description: 'Glass from a private collection.',
          image: null,
          featured: false,
        },
      },
    })
  })

  it('leaves out what is not known yet', () => {
    const { input } = validateAuctionForm({ ...valid, lotCount: '', viewingStart: '', viewingEnd: '' }, { mode: 'create', today })
    expect(input?.fields).toMatchObject({ lotCount: null, viewing: null, image: null })
  })

  it('lists every missing required field', () => {
    const { errors } = validateAuctionForm(emptyAuctionValues(), { mode: 'create', today })
    expect(Object.keys(errors).sort()).toEqual(['category', 'city', 'description', 'house', 'saleDate', 'saleTime', 'title'])
  })

  it.each([
    [{ saleDate: '2026-10-27', viewingStart: '', viewingEnd: '' }, 'saleDate', "The sale date can't be in the past."],
    [{ saleDate: '2031-10-29' }, 'saleDate', 'The sale date must be within the next 5 years.'],
    [{ saleDate: '2027-02-30' }, 'saleDate', 'Enter the sale date as a real date.'],
    [{ saleTime: '25:00' }, 'saleTime', 'Enter the sale time in 24-hour Paris time, such as 14:30.'],
    [{ lotCount: '0' }, 'lotCount', 'Enter the number of lots as a whole number from 1 to 100,000.'],
    [{ lotCount: '12.5' }, 'lotCount', 'Enter the number of lots as a whole number from 1 to 100,000.'],
    [{ viewingEnd: '' }, 'viewingEnd', 'Enter both viewing days, or neither.'],
    [{ viewingStart: '2026-12-06', viewingEnd: '2026-12-05' }, 'viewingEnd', 'Viewing must end on or after the day it starts.'],
    [{ viewingEnd: '2026-12-08' }, 'viewingEnd', 'Viewing must end on or before the sale date.'],
    [{ imageUrl: 'http://example.com/lot.jpg', imageAlt: 'A vase' }, 'imageUrl', 'Use an https:// address or a path on this site, such as /images/sale.jpg.'],
    [{ imageUrl: '//example.com/lot.jpg', imageAlt: 'A vase' }, 'imageUrl', 'Use an https:// address or a path on this site, such as /images/sale.jpg.'],
    [{ imageUrl: '/images/lot.jpg' }, 'imageAlt', "Describe the image for people who can't see it."],
    [{ id: 'Not A Slug' }, 'id', 'Use lower-case letters, digits and hyphens only, such as vauclair-tableaux-anciens-2026-11.'],
    [{ title: 'x'.repeat(201) }, 'title', 'Keep this to 200 characters or fewer.'],
  ])('refuses %o', (values, field, message) => {
    expect(errorsOf(values)).toEqual({ [field]: message })
  })

  it('lets a completed sale be corrected without moving its date, but not moved into the past', () => {
    const past = { saleDate: '2026-10-02', viewingStart: '', viewingEnd: '' }
    expect(errorsOf(past, 'edit', '2026-10-02')).toEqual({})
    expect(errorsOf({ ...past, saleDate: '2026-10-01' }, 'edit', '2026-10-02')).toEqual({ saleDate: "The sale date can't be in the past." })
  })

  it('keeps the id as it is when editing', () => {
    const { input } = validateAuctionForm({ ...valid, id: 'existing-sale-2026-12' }, { mode: 'edit', originalSaleDate: valid.saleDate, today })
    expect(input?.id).toBe('existing-sale-2026-12')
  })

  it('suggests ids from the title and month, and recognises real dates', () => {
    expect(suggestAuctionId('Arts décoratifs & design — XXe', '2027-01-21')).toBe('arts-decoratifs-design-xxe-2027-01')
    expect(suggestAuctionId('', '')).toBe('')
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2027-02-29')).toBe(false)
    expect(isIsoDate('07/12/2026')).toBe(false)
  })
})
