/**
 * The unit coverage settings from `build/unit-coverage.toml`, checked and shaped for Vitest's
 * `test.coverage`. Coverage is collected only with `--coverage` (`bun run test:coverage`).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { z } from 'zod';

const percent = z.number().min(0).max(100);
const limits = z.strictObject({
  lines: percent,
  statements: percent,
  functions: percent,
  branches: percent,
});

const schema = z.strictObject({
  reports_directory: z.string().min(1),
  reporters: z.array(z.enum(['text-summary', 'json-summary', 'lcov', 'html'])).min(1),
  include: z.array(z.string().min(1)).min(1),
  exclude: z.array(z.string().min(1)),
  thresholds: limits.extend({ folders: z.record(z.string().min(1), limits) }),
});

export function unitCoverage(appRoot: string) {
  const config = schema.parse(
    parse(readFileSync(path.join(appRoot, 'build/unit-coverage.toml'), 'utf8')),
  );
  const { folders, ...total } = config.thresholds;
  return {
    provider: 'v8' as const,
    reportsDirectory: config.reports_directory,
    reporter: config.reporters,
    include: config.include,
    exclude: config.exclude,
    thresholds: { ...total, ...folders },
  };
}
