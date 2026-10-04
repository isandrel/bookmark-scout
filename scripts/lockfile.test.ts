import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Newest `bun.lock` format Dependabot's bundled Bun reads. Bun 1.4 writes format 2 for a brand-new
 * lockfile and keeps whatever version an existing one has; formats 1 and 2 differ only in this
 * number. Dependabot fails every Bun update on format 2 ("Unsupported bun.lock 'lockfileVersion'
 * 2") until it ships Bun 1.4 (dependabot/dependabot-core#16071). Raise this once it does.
 */
const DEPENDABOT_MAX_LOCKFILE_VERSION = 1;

const lockfile = readFileSync(join(import.meta.dir, "..", "bun.lock"), "utf8");

describe("bun.lock", () => {
  it("stays in a format Dependabot can update", () => {
    const version = Number(/"lockfileVersion":\s*(\d+)/.exec(lockfile)?.[1]);
    expect(version).toBeLessThanOrEqual(DEPENDABOT_MAX_LOCKFILE_VERSION);
  });
});
