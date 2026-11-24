import { defineConfig } from '@playwright/test';

// Every test gets its own server and its own copy of the demo database (see e2e/fixtures.ts).
// The browser is the Edge that ships with Windows: nothing to download.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    channel: 'msedge',
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
});
