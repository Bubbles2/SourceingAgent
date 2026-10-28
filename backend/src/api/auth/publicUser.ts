import type { UserRecord, UserRole } from '../../repositories/usersRepository.ts'

/** What the API returns about a user: never the password hash or internal timestamps. */
export type PublicUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  countryCode: string
  companyName: string | null
  telephone: string | null
  role: UserRole
  emailVerified: boolean
  createdAt: string
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    countryCode: user.countryCode,
    companyName: user.companyName,
    telephone: user.telephone,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  }
}
