#!/usr/bin/env bun
/**
 * Lists auto-imported names that survive as bare identifiers in a built extension. Minification
 * renames every resolved import, so a long source name left in the output means WXT did not inject
 * its import, and the code throws a ReferenceError at runtime. Lint, tsc, and unit tests miss this;
 * it once broke HTML import (an identifier right before `:` in a ternary was skipped).
 *
 * Usage, from the repository root after a build:
 *   bun .agents/skills/extension-feature-test/scripts/scan-unresolved-imports.ts apps/extension dist/chrome-mv3
 * Exits 1 when it finds any.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const [appDir = 'apps/extension', distDir = 'dist/chrome-mv3'] = process.argv.slice(2);
const declarations = readFileSync(path.join(appDir, '.wxt/types/imports.d.ts'), 'utf8');
// Short names collide with minified identifiers; project exports are long enough to be distinct.
const MIN_NAME_LENGTH = 8;
const names = [...declarations.matchAll(/^\s+const (\w+): typeof import\('([^']+)'\)/gm)]
  .filter(([, , source]) => source.includes('/src/'))
  .map(([, name]) => name)
  .filter((name) => name.length >= MIN_NAME_LENGTH);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith('.js') ? [full] : [];
  });

// Not part of a longer word, a property access, a string, a path, or a chunk file name.
const BEFORE = String.raw`(?<![\w$.'"\x60/-])`;
const AFTER = String.raw`(?![\w$'"\x60/-])`;

const found: string[] = [];
for (const file of files(path.join(appDir, distDir))) {
  const code = readFileSync(file, 'utf8');
  for (const name of names) {
    for (const match of code.matchAll(new RegExp(`${BEFORE}${name}${AFTER}`, 'g'))) {
      const start = match.index ?? 0;
      const end = start + name.length;
      // `{name:` or `,name:` is an object key; `?name:` (a ternary branch) is a real use.
      if (code[end] === ':' && /[{,]/.test(code[start - 1] ?? '')) continue;
      found.push(`${path.basename(file)}: ${name} … ${code.slice(Math.max(0, start - 40), end + 20)}`);
    }
  }
}
console.log(found.length ? found.join('\n') : 'no unresolved auto-imports');
process.exit(found.length ? 1 : 0);
