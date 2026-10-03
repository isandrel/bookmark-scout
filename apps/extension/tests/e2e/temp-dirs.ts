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

/**
 * Global teardown: fails the run when a fixture left a scratch folder behind, after removing it,
 * so a leak is caught in CI instead of filling the disk.
 */
export default function checkTempDirsRemoved(config: FullConfig): void {
  const outputDirs = new Set(config.projects.map((project) => project.outputDir));
  const leftovers = [...outputDirs].flatMap(leftoverTempDirs);
  for (const directory of leftovers) removeTempDir(directory);
  if (leftovers.length > 0) {
    throw new Error(
      `E2E fixtures left ${leftovers.length} scratch folder(s) behind:\n${leftovers.join('\n')}`,
    );
  }
}
