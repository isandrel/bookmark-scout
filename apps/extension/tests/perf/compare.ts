/**
 * Measures a base commit and the checked-out code on the same machine, back to back, and fails
 * only when head is slower than base (`compare-results.ts`, `[compare]` in `perf.toml`). Shared CI
 * runners differ in speed by more than most regressions, so absolute budgets hold on one machine
 * (`test:perf`) and this comparison is what the Performance workflow enforces.
 *
 *   bun tests/perf/compare.ts [--base <ref>] [--grep <pattern>]
 *
 * Head is the build in `dist/chrome-mv3` (the Nx target builds it first). Base is built from a
 * detached worktree of `<ref>` (default `[compare] default_base`) under the user's cache folder,
 * which is removed afterwards; head's own commit with nothing changed since reuses head's build.
 * Both sides run head's scenarios and harness, so the measuring code is the same. Each scenario
 * runs for base and head in turn, `[compare] rounds` times, and the side that goes first
 * alternates. A base scenario that fails (a selector head changed) leaves its metrics uncompared.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  compareResults,
  comparisonMarkdown,
  comparisonText,
  isRegression,
  poolReports,
  scenarioReportSchema,
} from './compare-results';
import { perfConfig } from './perf-config';
import { PERF_ENV } from './perf-env';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const BUILD = 'chrome-mv3';
const RESULTS = path.join(appRoot, 'test-results/perf-compare');
const PLAYWRIGHT_PERF = [
  'bunx',
  'playwright',
  'test',
  '--config',
  'playwright.config.ts',
  '--project=perf',
];

type Side = 'base' | 'head';

function run(command: string[], options: { cwd: string; env?: Record<string, string> }): number {
  const { exitCode } = Bun.spawnSync(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return exitCode;
}

function output(command: string[], cwd: string): string {
  const result = Bun.spawnSync(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function must(command: string[], cwd: string, env?: Record<string, string>) {
  if (run(command, { cwd, env }) !== 0) throw new Error(`${command.join(' ')} failed in ${cwd}`);
}

/** Builds `sha` in a detached worktree; returns the build folder and how to remove the worktree. */
function buildBase(sha: string): { dist: string; remove: () => void } {
  const cacheRoot = process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache');
  const checkout = path.join(cacheRoot, perfConfig.compare.base_checkout_dir, sha);
  const remove = () => {
    run(['git', 'worktree', 'remove', '--force', checkout], { cwd: appRoot });
    rmSync(checkout, { recursive: true, force: true });
  };
  remove();
  mkdirSync(path.dirname(checkout), { recursive: true });
  must(['git', 'worktree', 'add', '--detach', checkout, sha], appRoot);
  console.log(`\nBuilding base ${sha} in ${checkout}`);
  must(['bun', 'install', '--frozen-lockfile'], checkout);
  must(['bunx', 'nx', 'run', 'extension:build:chrome', '--output-style=static'], checkout, {
    NX_DAEMON: 'false',
  });
  return { dist: path.join(checkout, 'apps/extension/dist', BUILD), remove };
}

/** The part of Playwright's `--list --reporter=json` output read here. */
type ListedSuite = {
  specs?: { file: string; line: number; title: string }[];
  suites?: ListedSuite[];
};
const listedSuiteSchema: z.ZodType<ListedSuite> = z.lazy(() =>
  z.object({
    specs: z
      .array(z.object({ file: z.string().min(1), line: z.number().int(), title: z.string() }))
      .optional(),
    suites: z.array(listedSuiteSchema).optional(),
  }),
);
const listSchema = z.object({ suites: z.array(listedSuiteSchema) });

/** The perf scenarios as `file:line` locations, in Playwright's order. */
function listScenarios(grep: string | undefined): { location: string; title: string }[] {
  const json = output(
    [...PLAYWRIGHT_PERF, '--list', '--reporter=json', ...(grep ? ['--grep', grep] : [])],
    appRoot,
  );
  const { suites } = listSchema.parse(JSON.parse(json));
  const walk = (suite: ListedSuite): { location: string; title: string }[] => [
    ...(suite.specs ?? []).map((spec) => ({
      location: `${spec.file}:${spec.line}`,
      title: spec.title,
    })),
    ...(suite.suites ?? []).flatMap(walk),
  ];
  return suites.flatMap(walk);
}

function readSide(folder: string) {
  if (!existsSync(folder)) return new Map();
  const files = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.json'),
  );
  return poolReports(
    files.map((file) =>
      scenarioReportSchema.parse(JSON.parse(readFileSync(path.join(folder, file), 'utf8'))),
    ),
  );
}

function main() {
  const { values } = parseArgs({
    options: { base: { type: 'string' }, grep: { type: 'string' } },
  });
  const baseRef = values.base || perfConfig.compare.default_base;
  const baseSha = output(['git', 'rev-parse', '--verify', `${baseRef}^{commit}`], appRoot);
  const headSha = output(['git', 'rev-parse', 'HEAD'], appRoot);
  const headDist = path.join(appRoot, 'dist', BUILD);
  if (!existsSync(path.join(headDist, 'manifest.json'))) {
    throw new Error(`Build head first: ${headDist} has no manifest.json`);
  }
  const scenarios = listScenarios(values.grep);
  if (scenarios.length === 0) throw new Error('No perf scenarios matched');

  // Head's build is base's only when nothing is changed since that commit.
  const clean = output(['git', 'status', '--porcelain'], appRoot) === '';
  const base =
    baseSha === headSha && clean ? { dist: headDist, remove: () => undefined } : buildBase(baseSha);
  const dists: Record<Side, string> = { base: base.dist, head: headDist };
  const failed: Record<Side, string[]> = { base: [], head: [] };
  rmSync(RESULTS, { recursive: true, force: true });
  try {
    const { rounds } = perfConfig.compare;
    for (const [index, { location, title }] of scenarios.entries()) {
      for (let round = 0; round < rounds; round++) {
        // Alternate which side goes first, so a runner that slows down over time favors neither.
        const order: Side[] = (index + round) % 2 === 0 ? ['base', 'head'] : ['head', 'base'];
        for (const side of order) {
          console.log(
            `\n== ${side} (${side === 'base' ? baseSha : headSha}) round ${round + 1}/${rounds}: ${title}`,
          );
          const code = run([...PLAYWRIGHT_PERF, '--reporter=line', location], {
            cwd: appRoot,
            env: {
              [PERF_ENV.extensionDir]: dists[side],
              [PERF_ENV.resultsDir]: path.join(RESULTS, side, `round-${round + 1}`),
              [PERF_ENV.compare]: '1',
            },
          });
          if (code !== 0) failed[side].push(`${title} (round ${round + 1})`);
        }
      }
    }
  } finally {
    base.remove();
  }

  const rows = compareResults(
    readSide(path.join(RESULTS, 'base')),
    readSide(path.join(RESULTS, 'head')),
    perfConfig.compare,
  );
  const regressions = rows.filter(isRegression);
  const { max_ratio, min_delta, max_p_value, min_samples } = perfConfig.compare;
  const margins = Object.entries(min_delta)
    .map(([unit, margin]) => `${margin} ${unit}`)
    .join(' / ');
  const rule = [
    `A budgeted metric fails when head's median is over ${max_ratio}x base's and over it by more`,
    `than ${margins}, with a one-sided rank-sum p-value of at most ${max_p_value} when both sides`,
    `have ${min_samples} or more samples.`,
  ].join(' ');
  const notes = [
    ...failed.head.map((title) => `Head scenario failed: ${title}`),
    ...failed.base.map((title) => `Base scenario failed (its metrics are not compared): ${title}`),
    ...regressions.map(({ metric, verdict }) => `Regression: ${metric} (${verdict})`),
  ];
  console.log(`\nBase ${baseRef} (${baseSha}) against head ${headSha}\n${rule}\n`);
  console.log(comparisonText(rows));
  if (notes.length) console.log(`\n${notes.join('\n')}`);

  const summary = [
    '## Performance: base against head',
    '',
    `Base \`${baseRef}\` (${baseSha}) against head ${headSha}, measured on the same machine. ${rule}`,
    '',
    comparisonMarkdown(rows),
    ...(notes.length ? ['', ...notes.map((note) => `- ${note}`)] : []),
    '',
  ].join('\n');
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(path.join(RESULTS, 'summary.md'), summary);
  writeFileSync(
    path.join(RESULTS, 'comparison.json'),
    `${JSON.stringify({ base: { ref: baseRef, sha: baseSha }, head: { sha: headSha }, settings: perfConfig.compare, failed, rows }, null, 2)}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
  }
  return failed.head.length || regressions.length ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
