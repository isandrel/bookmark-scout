/**
 * End-to-end coverage settings from `build/e2e-coverage.toml`, checked once. The coverage build
 * and run are turned on by `BS_E2E_COVERAGE=1` (`bun run test:e2e:coverage`).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { z } from 'zod';

/** The environment variable that turns on the coverage build and its collection. */
export const E2E_COVERAGE_ENV = 'BS_E2E_COVERAGE';

const schema = z.strictObject({
  out_dir: z.string().min(1),
  reports_directory: z.string().min(1),
  reporters: z.array(z.enum(['v8', 'json-summary', 'lcov', 'console-summary', 'html'])).min(1),
  include: z.array(z.string().min(1)).min(1),
  summary_folders: z.array(z.string().min(1)),
});

const appRoot = path.resolve(import.meta.dirname, '..');

export const e2eCoverage = schema.parse(
  parse(readFileSync(path.join(appRoot, 'build/e2e-coverage.toml'), 'utf8')),
);

export function e2eCoverageEnabled(): boolean {
  return process.env[E2E_COVERAGE_ENV] === '1';
}

/** The folder the extension is built into and loaded from: the coverage build when it is on. */
export function extensionOutDir(): string {
  return e2eCoverageEnabled() ? e2eCoverage.out_dir : 'dist';
}
