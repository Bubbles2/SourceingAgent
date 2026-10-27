/** A customer's profile. The prototype never keeps a password alongside it. */
export type CustomerAccount = {
  id: string
  firstName: string
  lastName: string
  email: string
  /** ISO 3166-1 alpha-2, e.g. "FR" */
  countryCode: string
  companyName: string | null
  telephone: string | null
  /** ISO timestamp */
  createdAt: string
}

export type RegistrationInput = Omit<CustomerAccount, 'id' | 'createdAt'> & {
  password: string
}

export type SignInInput = {
  email: string
  password: string
}
