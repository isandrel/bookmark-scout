import { defineConfig } from '@playwright/test';
import type { ExtensionProjectOptions } from './tests/e2e/fixtures';

export default defineConfig<ExtensionProjectOptions>({
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
  projects: [
    {
      name: 'chromium',
      testDir: './tests/e2e',
      use: { extensionBrowser: 'chromium', extensionBuild: 'chrome-mv3' },
    },
    {
      // The installed Microsoft Edge running the Edge build through the same suite.
      name: 'edge',
      testDir: './tests/e2e',
      use: { extensionBrowser: 'msedge', extensionBuild: 'edge-mv3' },
    },
    {
      // Playwright cannot open moz-extension:// pages, so this project drives Firefox through
      // geckodriver; see tests/e2e-firefox/fixtures.ts.
      name: 'firefox',
      testDir: './tests/e2e-firefox',
      // No Playwright page exists here; the fixture saves its own failure screenshot.
      use: { screenshot: 'off', trace: 'off' },
    },
  ],
});
