import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 2,
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    launchOptions: {
      // Software WebGL2 for headless runs.
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', baseURL: 'http://localhost:5199' } }],
})
