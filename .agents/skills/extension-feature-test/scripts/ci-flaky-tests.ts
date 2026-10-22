#!/usr/bin/env bun
/**
 * Ranks the end-to-end tests that failed in recent CI runs, including those a retry hid (a job
 * that passed after a retry still logs the first failure), with the first error and the line it
 * stopped at. Use it to pick which flaky test to fix, instead of re-running suites to find one.
 *
 * Usage, from a checkout of the repository (needs `gh`, signed in):
 *   bun .agents/skills/extension-feature-test/scripts/ci-flaky-tests.ts [runs]
 * `runs` is how many recent CI workflow runs to read (default 40). Job logs are cached in
 * ~/.cache/bookmark-scout-flaky/logs, so a second run only downloads new jobs.
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const runs = Number(process.argv[2] ?? '40');
const cache = path.join(homedir(), '.cache', 'bookmark-scout-flaky', 'logs');
mkdirSync(cache, { recursive: true });

const repo = (await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text()).trim();
const completed = '.[]|select(.status=="completed")|.databaseId';
const runIds = (
  await $`gh run list -R ${repo} --workflow CI --limit ${runs} --json databaseId,status --jq ${completed}`.text()
)
  .split('\n')
  .filter(Boolean);

/** Requests to GitHub at the same time: hundreds of job logs one by one took over 20 minutes. */
const PARALLEL = 8;

/** Runs `work` on every item, `PARALLEL` at a time, keeping the order of `items`. */
async function inParallel<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await work(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results;
}

type Job = { id: number; name: string; conclusion: string | null };
const jobs = (
  await inParallel(runIds, async (run) =>
    (
      (await $`gh api ${`repos/${repo}/actions/runs/${run}/jobs?per_page=100`} --jq .jobs`
        .json()
        .catch(() => [])) as Job[]
    ).filter((job) => /E2E|smoke/.test(job.name)),
  )
).flat();
// Cancelled jobs stop mid-run and say nothing about a test.
const readable = jobs.filter((job) => job.conclusion === 'success' || job.conclusion === 'failure');

const logOf = async (job: Job) => {
  const file = path.join(cache, `${job.id}.log`);
  if (!existsSync(file)) {
    writeFileSync(file, await $`gh run view -R ${repo} --job ${job.id} --log`.text().catch(() => ''));
  }
  return readFileSync(file, 'utf8');
};

// `gh` prints escape codes as caret text (`^[[31m`); every line starts with the job, the step,
// and a timestamp.
const clean = (line: string) =>
  line
    .replace(/(\x1b|\^\[)\[[0-9;]*[A-Za-z]/g, '')
    .split('\t')
    .slice(2)
    .join('\t')
    .replace(/^\S+Z /, '');

const logs = await inParallel(readable, logOf);
const failures = new Map<string, { jobs: Set<number>; errors: Map<string, number> }>();
for (const [position, job] of readable.entries()) {
  const lines = (logs[position] ?? '').split('\n').map(clean);
  let title = '';
  let block: string[] = [];
  const flush = () => {
    if (!title) return;
    const error = block.find((line) => /^\s+(Error:|Test timeout)/.test(line))?.trim() ?? '';
    const at = block.find((line) => /^\s+>\s+\d+ \|/.test(line))?.trim() ?? '';
    const entry = failures.get(title) ?? { jobs: new Set(), errors: new Map() };
    entry.jobs.add(job.id);
    const key = `${error.slice(0, 120)}${at ? `  ${at.slice(0, 100)}` : ''}`;
    entry.errors.set(key, (entry.errors.get(key) ?? 0) + 1);
    failures.set(title, entry);
  };
  for (const line of lines) {
    const failure = line.match(/^\s+\d+\) \[[\w-]+\] › (\S+?):\d+:\d+ › (.+?)\s*$/);
    if (failure) {
      flush();
      title = `${failure[1]} › ${failure[2]}`;
      block = [];
    } else if (/^\s+\d+ (failed|flaky|passed|skipped)/.test(line)) {
      flush();
      title = '';
    } else {
      block.push(line);
    }
  }
  flush();
}

console.log(`${readable.length} E2E jobs from ${runIds.length} CI runs (${repo})\n`);
for (const [title, { jobs: failedIn, errors }] of [...failures].sort(
  (a, b) => b[1].jobs.size - a[1].jobs.size,
)) {
  console.log(`${failedIn.size}  ${title}`);
  for (const [error, count] of [...errors].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    console.log(`     ${count}× ${error}`);
  }
}
