/**
 * Workspace values the extension's pages link to, compiled in as `import.meta.env.*` constants
 * read from the workspace's `config/web.toml`, so no URL is copied into the extension. Keep it in
 * both wxt.config.ts and vitest.config.ts: WxtVitest does not inherit WXT's Vite config. The file
 * is read directly because Vitest loads its config with Node, which cannot import the TypeScript
 * sources of `@bookmark-scout/config`. The names are declared in `src/vite-env.d.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const webConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config/web.toml',
);
const web = parse(readFileSync(webConfigPath, 'utf8')) as { docs?: { url?: unknown } };
const docsUrl = web.docs?.url;
if (typeof docsUrl !== 'string' || !/^https:\/\/[^/]+$/.test(docsUrl)) {
  throw new Error(`config/web.toml: [docs] url must be an https origin, got ${String(docsUrl)}`);
}

export const siteDefines: Record<string, string> = {
  'import.meta.env.BOOKMARK_SCOUT_DOCS_URL': JSON.stringify(docsUrl),
};
