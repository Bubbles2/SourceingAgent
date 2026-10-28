import { removeTestAccounts } from './support/testData'

/** Leaves the development database as the tests found it. */
export default function globalTeardown(): void {
  removeTestAccounts()
}
