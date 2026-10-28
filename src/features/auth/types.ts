export type CustomerRole = 'customer' | 'administrator'

/** The signed-in person's profile, as the API returns it. Never includes the password. */
export type CustomerAccount = {
  id: string
  firstName: string
  lastName: string
  email: string
  /** ISO 3166-1 alpha-2, e.g. "FR" */
  countryCode: string
  companyName: string | null
  telephone: string | null
  role: CustomerRole
  emailVerified: boolean
  /** ISO timestamp */
  createdAt: string
}

export type RegistrationInput = {
  firstName: string
  lastName: string
  email: string
  password: string
  countryCode: string
  companyName: string | null
  telephone: string | null
}

export type SignInInput = {
  email: string
  password: string
}
