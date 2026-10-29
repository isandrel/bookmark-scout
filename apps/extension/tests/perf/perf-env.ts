/**
 * Environment variables the base-versus-head comparison (`tests/perf/compare.ts`) sets for each
 * Playwright run it starts. Kept apart from `perf-config.ts` so the Playwright config can read
 * them without parsing `perf.toml`.
 */
export const PERF_ENV = {
  /** An absolute path to the unpacked build the perf project loads instead of `dist/chrome-mv3`. */
  extensionDir: 'BS_PERF_EXTENSION_DIR',
  /** Where the harness writes its `<scenario>.json` reports instead of `test-results/perf`. */
  resultsDir: 'BS_PERF_RESULTS_DIR',
  /** `1`: the harness reports budgets and timeouts and leaves judging them to the comparison. */
  compare: 'BS_PERF_COMPARE',
} as const;
