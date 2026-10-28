// What reaches the console when a page fails to render. The API's expected refusals (signed out,
// not an administrator) aren't bugs: the error page explains them to the visitor instead.
import { isAccessError } from '../services/apiClient'

/** createRoot's onCaughtError: errors an error boundary caught and replaced with the error page */
export function reportCaughtError(error: unknown, errorInfo: { componentStack?: string }): void {
  if (!isAccessError(error)) {
    console.error(error, errorInfo.componentStack)
  }
}

/**
 * RouterProvider's onError. Render errors are reported once, by reportCaughtError; without a handler
 * here the router would log them again, refusals included.
 */
export function reportRouteError(): void {}
