/**
 * Workspace values the extension uses, compiled in as `import.meta.env.*` constants read from the
 * workspace's `config/web.toml` (the docs site) and `config/project.toml` (the supported
 * browsers), so no URL or list is copied into the extension. Keep it in
 * both wxt.config.ts and vitest.config.ts: WxtVitest does not inherit WXT's Vite config. The file
 * is read directly because Vitest loads its config with Node, which cannot import the TypeScript
 * sources of `@bookmark-scout/config`. The names are declared in `src/vite-env.d.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const workspaceConfigDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
);
const webConfigPath = path.join(workspaceConfigDir, 'web.toml');
const web = parse(readFileSync(webConfigPath, 'utf8')) as { docs?: { url?: unknown } };
const docsUrl = web.docs?.url;
if (typeof docsUrl !== 'string' || !/^https:\/\/[^/]+$/.test(docsUrl)) {
  throw new Error(`config/web.toml: [docs] url must be an https origin, got ${String(docsUrl)}`);
}

const project = parse(readFileSync(path.join(workspaceConfigDir, 'project.toml'), 'utf8')) as {
  browsers?: { supported?: unknown };
};
const browsers = project.browsers?.supported;
if (
  !Array.isArray(browsers) ||
  browsers.length === 0 ||
  !browsers.every((browser) => typeof browser === 'string' && /^[a-z]+$/.test(browser))
) {
  throw new Error('config/project.toml: [browsers] supported must list browser ids');
}

export const siteDefines: Record<string, string> = {
  'import.meta.env.BOOKMARK_SCOUT_DOCS_URL': JSON.stringify(docsUrl),
  // A JSON string: Vitest keeps `import.meta.env` values as strings.
  'import.meta.env.BOOKMARK_SCOUT_BROWSERS': JSON.stringify(JSON.stringify(browsers)),
};
