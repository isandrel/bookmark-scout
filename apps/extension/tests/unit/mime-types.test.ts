import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Media types are named once, in `src/lib/mime-types.ts`, and used by name everywhere else. */
const sourceDir = path.resolve(import.meta.dirname, '../../src');
const MIME_LITERAL = /['"`](?:text|application|image|audio|video|font)\/[a-z0-9.+-]+/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('media types', () => {
  it('are written only in src/lib/mime-types.ts', () => {
    const offenders = sourceFiles(sourceDir)
      .filter((file) => !file.endsWith(path.join('lib', 'mime-types.ts')))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ line, at: `${path.relative(sourceDir, file)}:${index + 1}` }))
          .filter(({ line }) => MIME_LITERAL.test(line) && !/^\s*(\*|\/\/)/.test(line))
          .map(({ at }) => at),
      );
    expect(offenders).toEqual([]);
  });
});
