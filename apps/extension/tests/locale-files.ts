/**
 * Serves the extension's own files (such as `_locales/ja/messages.json`) to `fetch`, as the
 * browser does for pages and the background, so unit tests can exercise on-demand locale loading
 * with a fresh `use-i18n` module that has no registered locales.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { vi } from 'vitest';
import { appRoot } from './config-files';

/** Stubs `fetch` with extension files from public/; undo with `vi.unstubAllGlobals()`. */
export function serveExtensionFiles() {
  const fetchFile = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    try {
      const body = await readFile(path.join(appRoot, 'public', decodeURIComponent(url.pathname)));
      return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  vi.stubGlobal('fetch', fetchFile);
  return fetchFile;
}
