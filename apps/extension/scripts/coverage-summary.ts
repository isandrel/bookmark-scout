/**
 * Prints measured coverage as a Markdown table: the total and some folders. For the unit suite
 * (`bun run test:coverage`), the folders with their own floor in build/unit-coverage.toml; CI
 * appends it to the job summary. For the end-to-end suite (`bun run test:e2e:coverage`), the
 * folders in build/e2e-coverage.toml.
 *
 * Usage: bun scripts/coverage-summary.ts [unit|e2e]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { e2eCoverage } from '../build/e2e-coverage';
import { unitCoverage } from '../build/unit-coverage';

const METRICS = ['lines', 'statements', 'functions', 'branches'] as const;
const PERCENT_DIGITS = 1;

const counts = z.object({ total: z.number(), covered: z.number() });
const fileSummary = z.object(Object.fromEntries(METRICS.map((metric) => [metric, counts])));
const summarySchema = z.record(z.string(), fileSummary);

const appRoot = path.resolve(import.meta.dirname, '..');
const kind = z.enum(['unit', 'e2e']).parse(process.argv[2] ?? 'unit');
const unit = unitCoverage(appRoot);
const { reportsDirectory, folders, title } =
  kind === 'unit'
    ? {
        reportsDirectory: unit.reportsDirectory,
        folders: Object.keys(unit.thresholds).filter((key) => key.includes('/')),
        title: 'Unit test coverage',
      }
    : {
        reportsDirectory: e2eCoverage.reports_directory,
        folders: e2eCoverage.summary_folders,
        title: 'End-to-end coverage (pages, the files they loaded)',
      };
const summary = summarySchema.parse(
  JSON.parse(readFileSync(path.join(appRoot, reportsDirectory, 'coverage-summary.json'), 'utf8')),
);

/** Percent of `metric` over the files whose path matches `glob`, or every file. */
function percent(metric: (typeof METRICS)[number], glob?: string): string {
  let covered = 0;
  let total = 0;
  for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue;
    // Unit reports name files by absolute path, end-to-end ones relative to the app.
    if (glob && !path.matchesGlob(path.relative(appRoot, path.resolve(appRoot, file)), glob)) {
      continue;
    }
    covered += entry[metric].covered;
    total += entry[metric].total;
  }
  return total === 0 ? '–' : `${((100 * covered) / total).toFixed(PERCENT_DIGITS)}%`;
}

const rows = [undefined, ...folders].map(
  (glob) =>
    `| ${glob ? `\`${glob}\`` : 'All of `src`'} | ${METRICS.map((m) => percent(m, glob)).join(' | ')} |`,
);
console.log(
  [
    `### ${title}`,
    '',
    `| Scope | ${METRICS.join(' | ')} |`,
    `| --- | ${METRICS.map(() => '---:').join(' | ')} |`,
    ...rows,
    '',
    kind === 'unit'
      ? 'Floors: `apps/extension/build/unit-coverage.toml`. Pages, components, and hooks are covered by the Playwright suites, which this does not measure.'
      : 'Settings: `apps/extension/build/e2e-coverage.toml`. Only files the pages loaded count; the background service worker is not measured.',
  ].join('\n'),
);
