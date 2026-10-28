import { expect, test as base } from '@playwright/test'

/**
 * Every test fails if the page throws or logs a console error. Expected API refusals (401, 409…)
 * show up as "Failed to load resource" and are allowed; anything else is a bug.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
          errors.push(message.text())
        }
      })
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
