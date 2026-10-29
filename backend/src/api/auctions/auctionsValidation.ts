import { z } from 'zod'
import { pageQuery } from '../../lib/validationFields.ts'

const isoDate = (message: string) => z.iso.date({ error: message })

/** Any id is looked up as given; one that matches no sale is a 404, not a validation error. */
export const auctionParams = z.object({ auctionId: z.string().max(200) })

export const listAuctionsQuery = z
  .object({
    period: z.enum(['upcoming', 'completed'], { error: 'period must be upcoming or completed.' }).optional(),
    from: isoDate('from must be a date (YYYY-MM-DD).').optional(),
    to: isoDate('to must be a date (YYYY-MM-DD).').optional(),
    ...pageQuery(24),
  })
  .refine(({ from, to }) => !from || !to || from <= to, { message: 'to must be on or after from.', path: ['to'] })

export type ListAuctionsQuery = z.infer<typeof listAuctionsQuery>
