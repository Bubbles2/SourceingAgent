import { z } from 'zod'
import { databaseIdField, pageQuery } from '../../lib/validationFields.ts'
import { bidRequestStatuses } from '../../repositories/bidRequestsRepository.ts'

export const listUsersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListUsersQuery = z.infer<typeof listUsersQuery>

const statusMessage = `Use one of: ${bidRequestStatuses.join(', ')}.`

/**
 * ?status=pending, several separated by commas (status=rejected,cancelled) or all; optionally
 * one sale (?auction=) and customers matching a search (?customer=).
 */
export const listBidRequestsQuery = z.object({
  status: z
    .string({ error: statusMessage })
    .default('pending')
    .transform((value) => (value === 'all' ? [...bidRequestStatuses] : value.split(',')))
    .pipe(z.array(z.enum(bidRequestStatuses, { error: statusMessage })).min(1, statusMessage)),
  auction: databaseIdField('auction must be the id of a sale.').optional(),
  customer: z
    .string({ error: 'customer must be text.' })
    .trim()
    .max(200, 'Keep the customer search to 200 characters or fewer.')
    .optional()
    .transform((value) => value || undefined),
  ...pageQuery(25),
})

/** Any id is looked up as given; one that matches no request is a 404. */
export const bidRequestParams = z.object({ requestId: z.string().max(100) })

/**
 * `from` is the status the administrator saw. If someone else changed the request in the meantime,
 * the change is refused rather than applied to a request in a different state.
 */
export const statusChangeBody = z.strictObject({
  from: z.enum(bidRequestStatuses, { error: `from: ${statusMessage}` }),
  to: z.enum(bidRequestStatuses, { error: `to: ${statusMessage}` }),
  note: z.string({ error: 'The note must be text.' }).trim().max(1000, 'Keep the note to 1,000 characters or fewer.').default(''),
})

export type ListBidRequestsQuery = z.infer<typeof listBidRequestsQuery>
export type StatusChangeBody = z.infer<typeof statusChangeBody>
