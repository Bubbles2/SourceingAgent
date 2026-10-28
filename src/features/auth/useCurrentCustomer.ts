import { useSyncExternalStore } from 'react'
import { getSessionSnapshot, subscribeToSession } from './sessionStore'
import type { CustomerAccount } from './types'

/** The signed-in customer, or null. Updates on sign-in and sign-out, including in other tabs. */
export function useCurrentCustomer(): CustomerAccount | null {
  return useSyncExternalStore(subscribeToSession, getSessionSnapshot)
}
