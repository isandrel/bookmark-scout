/**
 * Prints the unit coverage `bun run test:coverage` measured as a Markdown table: the total and
 * each folder that has its own floor in build/unit-coverage.toml. CI appends it to the job summary.
 *
 * Usage: bun scripts/coverage-summary.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { unitCoverage } from '../build/unit-coverage';

const METRICS = ['lines', 'statements', 'functions', 'branches'] as const;
const PERCENT_DIGITS = 1;

const counts = z.object({ total: z.number(), covered: z.number() });
const fileSummary = z.object(Object.fromEntries(METRICS.map((metric) => [metric, counts])));
const summarySchema = z.record(z.string(), fileSummary);

const appRoot = path.resolve(import.meta.dirname, '..');
const config = unitCoverage(appRoot);
const summary = summarySchema.parse(
  JSON.parse(
    readFileSync(path.join(appRoot, config.reportsDirectory, 'coverage-summary.json'), 'utf8'),
  ),
);

/** Percent of `metric` over the files whose path matches `glob`, or every file. */
function percent(metric: (typeof METRICS)[number], glob?: string): string {
  let covered = 0;
  let total = 0;
  for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue;
    if (glob && !path.matchesGlob(path.relative(appRoot, file), glob)) continue;
    covered += entry[metric].covered;
    total += entry[metric].total;
  }
  return total === 0 ? '–' : `${((100 * covered) / total).toFixed(PERCENT_DIGITS)}%`;
}

const folders = Object.keys(config.thresholds).filter((key) => key.includes('/'));
const rows = [undefined, ...folders].map(
  (glob) =>
    `| ${glob ? `\`${glob}\`` : 'All of `src`'} | ${METRICS.map((m) => percent(m, glob)).join(' | ')} |`,
);
console.log(
  [
    '### Unit test coverage',
    '',
    `| Scope | ${METRICS.join(' | ')} |`,
    `| --- | ${METRICS.map(() => '---:').join(' | ')} |`,
    ...rows,
    '',
    'Floors: `apps/extension/build/unit-coverage.toml`. Pages, components, and hooks are covered by the Playwright suites, which this does not measure.',
  ].join('\n'),
);
