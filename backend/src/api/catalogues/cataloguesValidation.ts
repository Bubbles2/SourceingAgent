// Checks that need only the request. Rules that depend on the sale and its other catalogues are in
// cataloguesService.ts.
import { z } from 'zod'
import { httpsUrlField, imageField, pageQuery, requiredText, slugField } from '../../lib/validationFields.ts'
import { statusFilters } from '../auctions/auctionVisibility.ts'

const lotNumber = (message: string) =>
  z.number({ error: message }).int(message).min(1, message).max(100_000, message)
const pageCountMessage = 'Enter the number of pages as a whole number from 1 to 10,000.'

/** Any id is looked up as given; one that matches no catalogue is a 404, not a validation error. */
export const catalogueParams = z.object({ catalogueId: z.string().max(200) })

export const listCataloguesQuery = z.object({
  period: z.enum(['upcoming', 'completed'], { error: 'period must be upcoming or completed.' }).optional(),
  auction: slugField('auction must be the id of a sale.').optional(),
  status: z.enum(statusFilters, { error: 'status must be published, draft, cancelled or all.' }).default('published'),
  ...pageQuery(24),
})

const catalogueFields = {
  auctionId: slugField('Choose the sale this catalogue belongs to.'),
  title: requiredText(200, 'Enter the catalogue title.'),
  description: z
    .string({ error: 'Describe the catalogue, or leave the description empty.' })
    .trim()
    .max(5000, 'Keep this to 5,000 characters or fewer.'),
  lots: z
    .object({
      first: lotNumber('Enter the first lot number as a whole number from 1 to 100,000.'),
      last: lotNumber('Enter the last lot number as a whole number from 1 to 100,000.'),
    })
    .refine(({ first, last }) => last >= first, { message: 'The last lot must be the same as or after the first lot.', path: ['last'] }),
  pageCount: z.number({ error: pageCountMessage }).int(pageCountMessage).min(1, pageCountMessage).max(10_000, pageCountMessage).nullable(),
  // The auction house's own PDF; nothing is downloaded or processed here.
  pdfUrl: httpsUrlField('Enter the full https:// address of the PDF published by the auction house.'),
  cover: imageField.nullable(),
}

export const createCatalogueBody = z.strictObject({
  id: slugField('Give the catalogue an id of lower-case letters, digits and hyphens, such as vauclair-tableaux-anciens.'),
  ...catalogueFields,
  description: catalogueFields.description.default(''),
  pageCount: catalogueFields.pageCount.default(null),
  cover: catalogueFields.cover.default(null),
})

/** Only the fields sent change. The id can't: links to the catalogue would break. */
export const updateCatalogueBody = z
  .strictObject(catalogueFields)
  .partial()
  // Only when nothing else is wrong, so an unknown field isn't also reported as "nothing sent"
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to change.',
    when: (payload) => payload.issues.length === 0,
  })

export type ListCataloguesQuery = z.infer<typeof listCataloguesQuery>
export type CreateCatalogueBody = z.infer<typeof createCatalogueBody>
export type UpdateCatalogueBody = z.infer<typeof updateCatalogueBody>
