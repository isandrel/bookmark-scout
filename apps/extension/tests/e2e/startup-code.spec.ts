import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { e2eCoverageEnabled } from '../../build/e2e-coverage';
import { expect, test } from './fixtures';

/**
 * Code that loads on first use (`*.lazy.ts(x)` behind `await import()`), never in what a page or
 * the background loads at start. Each marker is a string minifying keeps and the extension's own
 * code never contains.
 */
const LAZY_CODE = [
  {
    // About 1 MB; users who never use AI should not download or parse it. Error names defined by
    // `@ai-sdk/provider`, which every AI SDK package imports, and by `ai`.
    name: 'AI SDK',
    markers: [/AI_TypeValidationError/, /AI_NoOutputGeneratedError/],
  },
  {
    // Mozilla Readability and Turndown, used only when an AI feature reads a page.
    name: 'page reader',
    markers: [/_readabilityDataTable/, /turndown-root/],
  },
] as const;

/** React, and with it every UI library: the background has no UI. */
const REACT_MARKER = /react\.transitional\.element/;

const budgetsSchema = z.strictObject({
  eager_kib: z.record(z.string(), z.number().positive()),
});

const budgets = budgetsSchema.parse(
  parse(
    readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'startup-budgets.toml'),
      'utf8',
    ),
  ),
);

/** Static `import`/`export ... from` specifiers of a built module; `import()` is left out. */
function staticImports(source: string): string[] {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s*(?:[\w$*{},\s]*?\s*from\s*)?["'`]([^"'`]+\.js)["'`]/g,
    ),
  ].map((match) => match[1]);
}

/** Every module a page or the background loads before any code runs, by build-relative path. */
function eagerModules(buildPath: string, entries: string[]): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(path.join(buildPath, file), 'utf8');
    for (const specifier of staticImports(source)) {
      const resolved = specifier.startsWith('/')
        ? specifier.slice(1)
        : path.posix.join(path.posix.dirname(file), specifier);
      visit(resolved);
    }
  };
  for (const entry of entries) visit(entry);
  return seen;
}

function pageEntries(buildPath: string, html: string): string[] {
  const source = readFileSync(path.join(buildPath, html), 'utf8');
  return [...source.matchAll(/<(?:script|link)[^>]+(?:src|href)="\/([^"]+\.js)"/g)].map(
    (match) => match[1],
  );
}

/** The pages and the background, each with the modules it loads at start. */
function startupGraphs(buildPath: string): Map<string, string[]> {
  const pages = readdirSync(buildPath).filter((file) => file.endsWith('.html'));
  expect(pages).toEqual(expect.arrayContaining(['popup.html', 'options.html']));
  const scripts = readdirSync(buildPath).filter((file) => file.endsWith('.js'));
  expect(scripts).toContain('background.js');
  return new Map([
    ...pages.map((page) => [page, [...eagerModules(buildPath, pageEntries(buildPath, page))]]),
    ...scripts.map((script) => [script, [...eagerModules(buildPath, [script])]]),
  ] as [string, string[]][]);
}

const contains = (buildPath: string, file: string, markers: readonly RegExp[]) => {
  const source = readFileSync(path.join(buildPath, file), 'utf8');
  return markers.some((marker) => marker.test(source));
};

test.describe('startup code', () => {
  // The coverage build carries inline source maps, so its sizes and contents say nothing here.
  test.skip(e2eCoverageEnabled(), 'measured on the release build only');

  for (const { name, markers } of LAZY_CODE) {
    test(`${name} stays out of the code every page and the background load at start`, ({
      extensionPath,
    }) => {
      const chunks = readdirSync(path.join(extensionPath, 'chunks')).map(
        (file) => `chunks/${file}`,
      );
      // The markers still find the code, in the chunks loaded on first use.
      expect(chunks.filter((file) => contains(extensionPath, file, markers))).not.toEqual([]);

      for (const [entry, modules] of startupGraphs(extensionPath)) {
        expect(modules.length, entry).toBeGreaterThan(0);
        expect(
          modules.filter((file) => contains(extensionPath, file, markers)),
          entry,
        ).toEqual([]);
      }
    });
  }

  test('the background loads no React or UI code', ({ extensionPath }) => {
    const pageModules = startupGraphs(extensionPath).get('popup.html') ?? [];
    // The marker still finds React where it belongs.
    expect(pageModules.some((file) => contains(extensionPath, file, [REACT_MARKER]))).toBe(true);
    const background = [...eagerModules(extensionPath, ['background.js'])];
    expect(background.filter((file) => contains(extensionPath, file, [REACT_MARKER]))).toEqual([]);
  });

  test('each page and the background stay within their startup size budget', ({
    extensionPath,
  }) => {
    for (const [entry, modules] of startupGraphs(extensionPath)) {
      const budget = budgets.eager_kib[entry];
      expect(budget, `${entry} needs a budget in startup-budgets.toml`).toBeDefined();
      const bytes = modules.reduce(
        (sum, file) => sum + statSync(path.join(extensionPath, file)).size,
        0,
      );
      // Soft, so one run lists every entry over its budget, not only the first one.
      expect.soft(Math.round(bytes / 1024), `${entry} startup KiB`).toBeLessThanOrEqual(budget);
    }
  });
});
