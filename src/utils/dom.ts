/** Ref callback that moves focus to an element as soon as it mounts (give it tabIndex={-1}). */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
