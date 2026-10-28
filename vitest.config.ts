import { defineConfig } from 'vitest/config'

// Unit tests for the website's logic (src/**/*.test.ts). They run in Node: the UI itself is
// covered by the Playwright end-to-end tests in e2e/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
  },
})
