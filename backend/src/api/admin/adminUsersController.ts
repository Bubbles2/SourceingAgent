import type { Request, Response } from 'express'
import { getUserPage, type UserPage } from './adminUsersService.ts'
import type { ListUsersQuery } from './adminValidation.ts'

/** GET /api/admin/users?limit=&offset= */
export async function list(_req: Request, res: Response<UserPage, { validated: { query: ListUsersQuery } }>): Promise<void> {
  res.set('Cache-Control', 'no-store')
  res.json(await getUserPage(res.locals.validated.query))
}
