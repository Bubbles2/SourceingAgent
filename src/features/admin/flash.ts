/** Navigation state carrying a one-off confirmation to the next page, e.g. "Auction created." */
export function flashState(message: string): { flash: string } {
  return { flash: message }
}

export function readFlash(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'flash' in state && typeof state.flash === 'string' ? state.flash : null
}
