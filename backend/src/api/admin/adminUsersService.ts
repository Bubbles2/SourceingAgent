import { listUsers } from '../../repositories/usersRepository.ts'
import { toPublicUser, type PublicUser } from '../auth/publicUser.ts'
import type { ListUsersQuery } from './adminValidation.ts'

export type UserPage = {
  users: PublicUser[]
  total: number
  limit: number
  offset: number
}

/** Customers and administrators, newest first */
export async function getUserPage({ limit, offset }: ListUsersQuery): Promise<UserPage> {
  const { users, total } = await listUsers({ limit, offset })
  return { users: users.map(toPublicUser), total, limit, offset }
}
