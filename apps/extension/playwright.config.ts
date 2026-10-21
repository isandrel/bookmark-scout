import { availableParallelism } from 'node:os';
import { defineConfig } from '@playwright/test';
import type { ExtensionProjectOptions } from './tests/e2e/fixtures';

const isCI = Boolean(process.env.CI);

/**
 * Parallel workers for the Chromium and Edge suites. Every test launches its own browser with a
 * fresh profile, so tests are independent. CI runners have 4 vCPUs and each worker runs a whole
 * browser, so CI stays at 2. Locally half the cores, at most 4: 8 workers were slower than 4 and
 * timed out starting a browser under load. Override with PW_WORKERS (a count such as `6` or a share
 * of the cores such as `25%`), or `--workers` on the command line.
 */
const CI_WORKERS = 2;
const LOCAL_MAX_WORKERS = 4;
const DEFAULT_WORKERS = isCI
  ? CI_WORKERS
  : Math.max(1, Math.min(LOCAL_MAX_WORKERS, Math.floor(availableParallelism() / 2)));

function workersFromEnv(value: string | undefined): number | string {
  if (value === undefined || value === '') return DEFAULT_WORKERS;
  if (/^[1-9]\d*$/.test(value)) return Number(value);
  if (/^[1-9]\d*%$/.test(value)) return value;
  throw new Error(
    `PW_WORKERS must be a positive count or a percentage such as 50%, got "${value}"`,
  );
}

export default defineConfig<ExtensionProjectOptions>({
  fullyParallel: true,
  workers: workersFromEnv(process.env.PW_WORKERS),
  // One retry absorbs a cold-start timeout on a CI runner; a test that needs it shows as flaky in
  // the report. Locally a failure fails at once.
  retries: isCI ? 1 : 0,
  // Removes profiles and build copies a fixture left behind; fails a clean run that left any.
  // Then, with BS_E2E_COVERAGE=1, merges the pages' coverage into coverage/e2e.
  globalTeardown: ['./tests/e2e/temp-dirs.ts', './tests/e2e/coverage.ts'],
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
      // The local AI agent bridge end to end, with the compiled bookmark-scout-mcp binary as the
      // browser's native host (tests/e2e-bridge). Its own CI job; `nx run extension:test:e2e:bridge`.
      name: 'bridge',
      testDir: './tests/e2e-bridge',
      use: { extensionBrowser: 'chromium', extensionBuild: 'chrome-mv3' },
    },
    {
      // Latency and scrolling measurements on a large library (tests/perf/README.md). Not part of
      // the E2E suites: one worker, so measurements do not compete for the CPU, and no retries,
      // so a slow run is reported rather than retried away.
      name: 'perf',
      testDir: './tests/perf',
      fullyParallel: false,
      workers: 1,
      retries: 0,
      timeout: 20 * 60_000,
      use: {
        extensionBrowser: 'chromium',
        extensionBuild: 'chrome-mv3',
        screenshot: 'off',
        trace: 'off',
      },
    },
    {
      // Real AI features against a real provider (tests/live/README.md). Opt-in: every test skips
      // without the BS_LIVE_AI_* variables, and no pull request check runs it. One worker, so
      // calls do not compete for the provider's rate limit, and no retries, so a real failure is
      // reported. Nothing that could hold the API key is saved: no traces, screenshots, or video.
      name: 'live',
      testDir: './tests/live',
      fullyParallel: false,
      workers: 1,
      retries: 0,
      use: {
        extensionBrowser: 'chromium',
        extensionBuild: 'chrome-mv3',
        screenshot: 'off',
        trace: 'off',
        video: 'off',
      },
    },
    {
      // Playwright cannot open moz-extension:// pages, so this project drives Firefox through
      // geckodriver; see tests/e2e-firefox/fixtures.ts. Kept to one worker: the suite is short and
      // each test starts geckodriver and Firefox, which is not proven safe to run side by side.
      name: 'firefox',
      testDir: './tests/e2e-firefox',
      fullyParallel: false,
      workers: 1,
      // No Playwright page exists here; the fixture saves its own failure screenshot.
      use: { screenshot: 'off', trace: 'off' },
    },
  ],
});
