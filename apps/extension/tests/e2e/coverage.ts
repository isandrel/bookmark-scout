/**
 * Collects V8 coverage from the extension's pages during the Chromium suite when
 * `BS_E2E_COVERAGE=1` (build/e2e-coverage.ts), and, as a global teardown, turns what every worker
 * saved into the reports in `coverage/e2e`. Off by default: then nothing here runs.
 */
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { CoverageReport } from 'monocart-coverage-reports';
import { e2eCoverage, e2eCoverageEnabled } from '../../build/e2e-coverage';

const appRoot = path.resolve(import.meta.dirname, '../..');

function report() {
  return new CoverageReport({
    name: 'Bookmark Scout end-to-end coverage',
    outputDir: path.join(appRoot, e2eCoverage.reports_directory),
    reports: e2eCoverage.reporters,
    // Only the extension's own scripts; the inline source maps lead back to its sources.
    entryFilter: (entry) => entry.url.startsWith('chrome-extension://'),
    // The extension's own sources only: dependencies keep their node_modules path and are left out.
    sourcePath: (filePath) =>
      filePath.includes('node_modules') ? filePath : filePath.replace(/^(\.\.\/)+/, ''),
    sourceFilter: (sourcePath) =>
      !sourcePath.includes('node_modules') &&
      e2eCoverage.include.some((glob) => path.matchesGlob(sourcePath, glob)),
  });
}

const started = new WeakSet<Page>();

async function start(page: Page): Promise<void> {
  if (started.has(page)) return;
  started.add(page);
  await page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => undefined);
}

/** Starts collecting on every page of `context`, from the first script it runs. */
export function watchCoverage(context: BrowserContext): void {
  if (!e2eCoverageEnabled()) return;
  for (const page of context.pages()) void start(page);
  context.on('page', (page) => void start(page));
}

/** Saves the coverage of the pages still open in `context`; call before it closes. */
export async function saveCoverage(context: BrowserContext): Promise<void> {
  if (!e2eCoverageEnabled()) return;
  const entries = (
    await Promise.all(
      context
        .pages()
        .filter((page) => started.has(page) && !page.isClosed())
        .map((page) => page.coverage.stopJSCoverage().catch(() => [])),
    )
  ).flat();
  if (entries.length > 0) await report().add(entries);
}

/** Global teardown: merges what the workers saved into the reports. */
export default async function generateCoverage(): Promise<void> {
  if (!e2eCoverageEnabled()) return;
  await report().generate();
}
