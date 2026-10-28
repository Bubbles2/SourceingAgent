import { defineConfig, devices } from '@playwright/test'

// End-to-end tests for the website and API together, in the installed Google Chrome (no browser
// download). They reuse the dev servers on ports 3000 and 4000 when running, or start them, and use
// the local development database; accounts they create (e2e-…@example.com) are removed afterwards.
export default defineConfig({
  testDir: './e2e',
  // One worker: the tests share one database and the API's per-IP rate limits.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalTeardown: './e2e/globalTeardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], channel: 'chrome', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix backend run dev',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
