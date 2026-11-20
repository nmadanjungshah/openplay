import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the production web build against the LOCAL Supabase stack.
 *   npm run db:start        # once
 *   npm run test:e2e        # builds dist/ and runs the suite
 * Set PW_CHROMIUM_PATH to reuse an already-downloaded Chromium instead of `npx playwright install chromium`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node e2e/serve.mjs dist 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
