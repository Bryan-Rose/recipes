import { defineConfig } from '@playwright/test'

// Runs inside the e2e compose network (see compose.e2e.yml), where the app is
// http://frontend and the mock IdP is http://mock-idp:8080.
export default defineConfig({
  testDir: './tests',
  // One shared database: run serially so tests can't race on it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Under out/, the bind-mounted folder: Playwright deletes and recreates these,
  // which it can't do to a mount point itself.
  outputDir: 'out/test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'out/report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://frontend',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
