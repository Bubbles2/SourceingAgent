import type { CustomerAccount } from '../features/auth/types'
import { mockCurrentCustomer } from './session'

/** Sample account for trying sign-in (any password works in the prototype). It owns the demo bid requests. */
export const mockDemoAccount: CustomerAccount = {
  id: mockCurrentCustomer.id,
  firstName: 'Alex',
  lastName: 'Morgan',
  email: 'demo@example.com',
  countryCode: 'GB',
  companyName: 'Morgan & Hale Interiors',
  // Ofcom's range reserved for drama, so it reaches no one
  telephone: '+44 20 7946 0123',
  createdAt: '2026-03-14T10:30:00.000Z',
}
