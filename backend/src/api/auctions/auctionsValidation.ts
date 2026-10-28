// Checks that need only the request. Rules that compare against today, the stored sale or its
// catalogues are in auctionsService.ts.
import { z } from 'zod'
import { imageField, pageQuery, requiredText, slugField } from '../../lib/validationFields.ts'
import { auctionStatuses } from '../../repositories/auctionsRepository.ts'
import { statusFilters } from './auctionVisibility.ts'

const isoDate = (message: string) => z.iso.date({ error: message })
const lotCountMessage = 'Enter the number of lots as a whole number from 1 to 100,000.'
const viewingDateMessage = 'Enter viewing dates as YYYY-MM-DD.'

/** Any id is looked up as given; one that matches no sale is a 404, not a validation error. */
export const auctionParams = z.object({ auctionId: z.string().max(200) })

export const listAuctionsQuery = z
  .object({
    period: z.enum(['upcoming', 'completed'], { error: 'period must be upcoming or completed.' }).optional(),
    from: isoDate('from must be a date (YYYY-MM-DD).').optional(),
    to: isoDate('to must be a date (YYYY-MM-DD).').optional(),
    featured: z
      .enum(['true', 'false'], { error: 'featured must be true or false.' })
      .transform((value) => value === 'true')
      .optional(),
    status: z.enum(statusFilters, { error: 'status must be published, draft, cancelled or all.' }).default('published'),
    ...pageQuery(24),
  })
  .refine(({ from, to }) => !from || !to || from <= to, { message: 'to must be on or after from.', path: ['to'] })

const auctionFields = {
  title: requiredText(200, 'Enter the title of the sale.'),
  category: requiredText(100, 'Enter a category, such as Fine art.'),
  house: requiredText(200, 'Enter the auction house.'),
  city: requiredText(100, 'Enter the city or district, such as Paris 9e.'),
  saleDate: isoDate('Enter the sale date as YYYY-MM-DD.'),
  saleTime: z
    .string({ error: 'Enter the sale time in 24-hour Paris time, such as 14:30.' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter the sale time in 24-hour Paris time, such as 14:30.'),
  lotCount: z
    .number({ error: lotCountMessage })
    .int(lotCountMessage)
    .min(1, lotCountMessage)
    .max(100_000, lotCountMessage)
    .nullable(),
  viewing: z
    .object({ start: isoDate(viewingDateMessage), end: isoDate(viewingDateMessage) })
    .refine(({ start, end }) => start <= end, { message: 'Viewing must end on or after the day it starts.', path: ['end'] })
    .nullable(),
  description: requiredText(5000, 'Describe the sale.'),
  image: imageField.nullable(),
  featured: z.boolean({ error: 'featured must be true or false.' }),
  status: z.enum(auctionStatuses, { error: 'status must be draft, published or cancelled.' }),
}

/** A new sale. It stays a draft, hidden from the public, until it is published. */
export const createAuctionBody = z.strictObject({
  id: slugField(
    'Give the sale an id of lower-case letters, digits and hyphens, such as vauclair-tableaux-anciens-2026-11.',
  ),
  ...auctionFields,
  lotCount: auctionFields.lotCount.default(null),
  viewing: auctionFields.viewing.default(null),
  image: auctionFields.image.default(null),
  featured: auctionFields.featured.default(false),
  status: auctionFields.status.default('draft'),
})

/** Only the fields sent change. The id can't: links to the sale would break. */
export const updateAuctionBody = z
  .strictObject(auctionFields)
  .partial()
  // Only when nothing else is wrong, so an unknown field isn't also reported as "nothing sent"
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to change.',
    when: (payload) => payload.issues.length === 0,
  })

export type ListAuctionsQuery = z.infer<typeof listAuctionsQuery>
export type CreateAuctionBody = z.infer<typeof createAuctionBody>
export type UpdateAuctionBody = z.infer<typeof updateAuctionBody>
