import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './bench',
  timeout: 1_800_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
    headless: false,
    launchOptions: { args: ['--js-flags=--expose-gc'] },
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', baseURL: 'http://localhost:5199' } }],
})
