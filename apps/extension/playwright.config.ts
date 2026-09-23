import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  reporter: 'line',
  outputDir: './test-results/playwright',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
