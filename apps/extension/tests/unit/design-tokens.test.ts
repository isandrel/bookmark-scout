import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRoot } from '../config-files';

/**
 * A size cap that several components share is one named token in src/styles/theme.css
 * (`max-h-dialog`, `sm:w-settings-control`; DESIGN.md, spacing), not the same arbitrary value
 * typed in each. This fails when one arbitrary size (`max-h-[85vh]`, `w-[220px]`) appears in two
 * or more source files: give it a name in the `@theme` block instead.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** A width or height utility with an arbitrary length, such as `max-h-[85vh]` or `w-[220px]`. */
const ARBITRARY_SIZE =
  /(?<![\w-])(?:min-|max-)?(?:w|h|size)-\[[^\]]*\d(?:px|rem|em|vh|vw|dvh|%)[^\]]*\]/g;

describe('design tokens', () => {
  it('names every arbitrary size that more than one file uses', () => {
    const filesByValue = new Map<string, Set<string>>();
    for (const file of sourceFiles(path.join(appRoot, 'src'))) {
      for (const [value] of readFileSync(file, 'utf8').matchAll(ARBITRARY_SIZE)) {
        const files = filesByValue.get(value) ?? new Set<string>();
        files.add(path.relative(appRoot, file));
        filesByValue.set(value, files);
      }
    }
    const repeated = [...filesByValue]
      .filter(([, files]) => files.size > 1)
      .map(([value, files]) => `${value}: ${[...files].sort().join(', ')}`);
    expect(repeated).toEqual([]);
  });

  it('defines the named caps the components use', () => {
    const css = readFileSync(path.join(appRoot, 'src/styles/theme.css'), 'utf8');
    for (const token of [
      '--max-height-dialog',
      '--max-height-dialog-tall',
      '--max-height-dialog-screen',
      '--max-height-dialog-list',
      '--max-height-dialog-list-short',
      '--width-settings-control',
      '--min-width-settings-control',
      '--max-width-settings-control',
      '--width-settings-slider',
      '--min-width-menu',
    ]) {
      expect(css, token).toContain(`${token}:`);
    }
  });
});
