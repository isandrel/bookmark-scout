/**
 * Lists the tests that passed only on a retry, so CI's one retry does not hide them: each one is a
 * GitHub warning on the run, and the job summary names them all. The CI config adds it next to the
 * line reporter; nothing changes locally, where there are no retries.
 * `.agents/skills/extension-feature-test/scripts/ci-flaky-tests.ts` ranks them across runs.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase } from '@playwright/test/reporter';

export default class FlakyReporter implements Reporter {
  private readonly flaky: TestCase[] = [];

  onTestEnd(test: TestCase): void {
    if (test.outcome() === 'flaky') this.flaky.push(test);
  }

  onEnd(): void {
    if (this.flaky.length === 0) return;
    const rows = this.flaky.map((test) => {
      // GitHub places annotations by a path from the repository root.
      const file = path.relative(process.env.GITHUB_WORKSPACE ?? process.cwd(), test.location.file);
      // The title path starts with the root suite, the project, and the file.
      const title = test.titlePath().filter(Boolean).slice(2).join(' › ');
      console.log(
        `::warning file=${file},line=${test.location.line}::Passed only on a retry: ${title}`,
      );
      return `| ${file}:${test.location.line} | ${title.replaceAll('|', '\\|')} |`;
    });
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (!summary) return;
    appendFileSync(
      summary,
      [
        `### ${this.flaky.length} passed only on a retry`,
        '',
        '| Test | Title |',
        '| --- | --- |',
        ...rows,
        '',
      ].join('\n'),
    );
  }
}
