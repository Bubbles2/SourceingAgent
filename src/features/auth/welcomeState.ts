/** Navigation state that asks the account page to welcome a customer who has just registered */
export const welcomeState = { welcome: true } as const

export function isWelcomeState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'welcome' in state && state.welcome === true
}
