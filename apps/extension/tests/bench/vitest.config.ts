/**
 * Runs the dev-only benchmarks in this folder (`bun run bench:search`) with the unit tests'
 * plugins and setup, which the extension's config modules need, but never as part of the unit run.
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import unitConfig from '../../vitest.config';

export default defineConfig({
  ...unitConfig,
  root: path.resolve(import.meta.dirname, '../..'),
  test: {
    ...unitConfig.test,
    include: ['tests/bench/**/*.bench.ts'],
    // One run takes a while on the full library.
    testTimeout: 600_000,
  },
});
