import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures';

/**
 * Error names defined by `@ai-sdk/provider`, which every AI SDK package imports, and by `ai`.
 * Minifying keeps them, and the extension's own code never names these two.
 */
const AI_SDK_MARKERS = [/AI_TypeValidationError/, /AI_NoOutputGeneratedError/];

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

const hasAISDK = (buildPath: string, file: string) =>
  AI_SDK_MARKERS.some((marker) => marker.test(readFileSync(path.join(buildPath, file), 'utf8')));

// The AI SDK is about 1 MB; users who never use AI should not download or parse it.
test.describe('AI SDK loading', () => {
  test('stays out of the code every page and the background load at start', ({ extensionPath }) => {
    const chunks = readdirSync(path.join(extensionPath, 'chunks')).map((file) => `chunks/${file}`);
    // The markers still find the SDK, in the chunks loaded on first use.
    expect(chunks.filter((file) => hasAISDK(extensionPath, file))).not.toEqual([]);

    const pages = readdirSync(extensionPath).filter((file) => file.endsWith('.html'));
    expect(pages).toEqual(expect.arrayContaining(['popup.html', 'options.html']));
    for (const page of pages) {
      const eager = [...eagerModules(extensionPath, pageEntries(extensionPath, page))];
      expect(eager.length, page).toBeGreaterThan(0);
      expect(
        eager.filter((file) => hasAISDK(extensionPath, file)),
        page,
      ).toEqual([]);
    }

    const scripts = readdirSync(extensionPath).filter((file) => file.endsWith('.js'));
    expect(scripts).toContain('background.js');
    const eager = [...eagerModules(extensionPath, scripts)];
    expect(eager.filter((file) => hasAISDK(extensionPath, file))).toEqual([]);
  });
});
