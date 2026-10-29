import { z } from 'zod'
import { databaseIdField, pageQuery } from '../../lib/validationFields.ts'

export const listLotsQuery = z.object({
  auction: databaseIdField('auction must be the id of a sale.').optional(),
  period: z.enum(['upcoming', 'completed'], { error: 'period must be upcoming or completed.' }).optional(),
  ...pageQuery(24),
})

export type ListLotsQuery = z.infer<typeof listLotsQuery>
