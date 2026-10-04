import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TypeScript major per workspace. TypeScript 7 has no programmatic API yet, so anything that loads
 * the `typescript` module stays on 6:
 * - the root: Nx analyzes source imports with it, and on 7 the project graph silently loses every
 *   dependency between projects (with or without the `@nx/js` plugin entry in nx.json);
 * - the website: typescript-eslint, through eslint-config-next, refuses to run on 7.
 * The extension and docs only run `tsc` (and `next build`), which 7 handles about 5x faster.
 */
const TYPESCRIPT_MAJOR: Record<string, number> = {
  ".": 6,
  "apps/website": 6,
  "packages/config": 6,
  "apps/extension": 7,
  "apps/docs": 7,
};

const root = join(import.meta.dir, "..");

describe("TypeScript versions", () => {
  for (const [workspace, major] of Object.entries(TYPESCRIPT_MAJOR)) {
    it(`${workspace} uses TypeScript ${major}`, () => {
      const pkg = JSON.parse(readFileSync(join(root, workspace, "package.json"), "utf8")) as {
        devDependencies?: Record<string, string>;
      };
      const range = pkg.devDependencies?.typescript ?? "";
      expect(Number(/\d+/.exec(range)?.[0])).toBe(major);
    });
  }
});
