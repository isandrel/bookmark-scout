import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FullConfig, TestInfo, WorkerInfo } from '@playwright/test';
import { afterEach, describe, expect, it } from 'vitest';
import checkTempDirsRemoved, {
  leftoverTempDirs,
  profileDir,
  removeTempDir,
  workerTempDir,
} from '../e2e/temp-dirs';

let outputDir = '';

afterEach(() => {
  if (outputDir) rmSync(outputDir, { recursive: true, force: true });
});

function setUp() {
  outputDir = mkdtempSync(path.join(tmpdir(), 'bookmark-scout-temp-dirs-test-'));
  const workerInfo = { project: { outputDir } } as WorkerInfo;
  const testInfo = {
    outputPath: (...segments: string[]) => path.join(outputDir, 'some-test-chromium', ...segments),
  } as TestInfo;
  const config = { projects: [{ outputDir }, { outputDir }] } as FullConfig;
  return { workerInfo, testInfo, config };
}

describe('E2E scratch folders', () => {
  it('keeps build copies and profiles inside the output folder', () => {
    const { workerInfo, testInfo } = setUp();
    expect(workerTempDir(workerInfo, 'granted-build').startsWith(outputDir)).toBe(true);
    expect(profileDir(testInfo).startsWith(outputDir)).toBe(true);
  });

  it('finds no leftovers once every scratch folder was removed', () => {
    const { workerInfo, testInfo, config } = setUp();
    const copy = workerTempDir(workerInfo, 'granted-build');
    const profile = profileDir(testInfo);
    mkdirSync(profile, { recursive: true });
    writeFileSync(path.join(profile, 'Preferences'), '{}');
    // Failure artifacts next to a profile are not scratch and stay.
    writeFileSync(path.join(outputDir, 'some-test-chromium', 'trace.zip'), '');

    expect(leftoverTempDirs(outputDir).sort()).toEqual([copy, profile].sort());
    removeTempDir(copy);
    removeTempDir(profile);
    expect(leftoverTempDirs(outputDir)).toEqual([]);
    expect(() => checkTempDirsRemoved(config)).not.toThrow();
    expect(existsSync(path.join(outputDir, 'some-test-chromium', 'trace.zip'))).toBe(true);
  });

  it('fails the run on a leaked folder and removes it', () => {
    const { workerInfo, testInfo, config } = setUp();
    const copy = workerTempDir(workerInfo, 'granted-build');
    const profile = profileDir(testInfo);
    mkdirSync(profile, { recursive: true });

    expect(() => checkTempDirsRemoved(config)).toThrow(/left 2 scratch folder/);
    expect(existsSync(copy)).toBe(false);
    expect(existsSync(profile)).toBe(false);
  });

  it('accepts an output folder that does not exist yet', () => {
    expect(leftoverTempDirs(path.join(tmpdir(), 'bookmark-scout-missing-output'))).toEqual([]);
  });
});
