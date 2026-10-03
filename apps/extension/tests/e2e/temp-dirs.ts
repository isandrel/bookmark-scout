import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig, TestInfo, WorkerInfo } from '@playwright/test';

/**
 * Scratch folders the E2E fixtures create, kept inside the project's output folder rather than the
 * system temp folder. Fixture teardown removes each one; if a run is killed before teardown,
 * Playwright empties the output folder at the start of the next run, so nothing piles up.
 */

/** Per-worker scratch (build copies), under `<outputDir>/.tmp/`. */
const WORKER_TEMP_DIRECTORY = '.tmp';
/** Per-test browser profile, under the test's own output folder. */
const PROFILE_DIRECTORY = 'user-data';

/** A new empty folder for this worker, such as a copy of the build. Remove it in teardown. */
export function workerTempDir(workerInfo: WorkerInfo, prefix: string): string {
  const root = path.join(workerInfo.project.outputDir, WORKER_TEMP_DIRECTORY);
  mkdirSync(root, { recursive: true });
  return mkdtempSync(path.join(root, `${prefix}-`));
}

/** This test's browser profile folder. Remove it with `removeTempDir` once the browser closed. */
export function profileDir(testInfo: TestInfo): string {
  return testInfo.outputPath(PROFILE_DIRECTORY);
}

export function removeTempDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
}

/** Scratch folders left under one output folder: build copies and browser profiles. */
export function leftoverTempDirs(outputDir: string): string[] {
  if (!existsSync(outputDir)) return [];
  const leftovers: string[] = [];
  const workerRoot = path.join(outputDir, WORKER_TEMP_DIRECTORY);
  if (existsSync(workerRoot)) {
    for (const entry of readdirSync(workerRoot)) leftovers.push(path.join(workerRoot, entry));
  }
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profile = path.join(outputDir, entry.name, PROFILE_DIRECTORY);
    if (existsSync(profile)) leftovers.push(profile);
  }
  return leftovers;
}

/** Files Playwright or the fixtures save only for a failed attempt. */
const FAILURE_ARTIFACT = /^(error-context\.md|trace\.zip|test-failed-\d+\.png|failure\.png)$/;

/** Whether any attempt in this output folder failed, including one that passed on retry. */
export function hasFailedAttempts(outputDir: string): boolean {
  if (!existsSync(outputDir)) return false;
  return readdirSync(outputDir, { withFileTypes: true }).some(
    (entry) =>
      entry.isDirectory() &&
      readdirSync(path.join(outputDir, entry.name)).some((file) => FAILURE_ARTIFACT.test(file)),
  );
}

/**
 * Global teardown: removes every scratch folder left behind, and fails a run in which no attempt
 * failed, because there teardown should have removed them all: a leak is caught in CI instead of
 * filling the disk. An attempt that timed out (a browser launch that hung) can skip its teardown,
 * so after failed attempts the leftovers are only reported, and a retry that passed still passes.
 */
export default function checkTempDirsRemoved(config: FullConfig): void {
  const outputDirs = [...new Set(config.projects.map((project) => project.outputDir))];
  const leftovers = outputDirs.flatMap(leftoverTempDirs);
  if (leftovers.length === 0) return;
  for (const directory of leftovers) removeTempDir(directory);
  const message = `E2E fixtures left ${leftovers.length} scratch folder(s) behind:\n${leftovers.join('\n')}`;
  if (outputDirs.some(hasFailedAttempts)) {
    console.warn(`${message}\nRemoved; a failed attempt can skip its teardown.`);
    return;
  }
  throw new Error(message);
}
