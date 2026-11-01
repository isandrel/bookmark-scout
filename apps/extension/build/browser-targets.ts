/**
 * The Manifest version of each browser build, from `build/browser-targets.toml`, for the WXT
 * config, the build folder names, and the distribution size check.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { site } from '@bookmark-scout/config';
import { parse } from 'smol-toml';
import { z } from 'zod';
import type { SupportedBrowser } from '../src/lib/supported-browsers';

const manifestVersion = z.union([z.literal(2), z.literal(3)]);

const schema = z.strictObject({
  manifest_version: z.strictObject(
    Object.fromEntries(site.browsers.supported.map((browser) => [browser, manifestVersion])),
  ),
});

const config = schema.parse(
  parse(readFileSync(fileURLToPath(new URL('browser-targets.toml', import.meta.url)), 'utf8')),
);

/** The Manifest version each browser build targets. */
export const MANIFEST_VERSIONS = config.manifest_version as Readonly<
  Record<SupportedBrowser, 2 | 3>
>;

/** The one version every build targets; WXT takes a single `manifestVersion` per run. */
export function sharedManifestVersion(): 2 | 3 {
  const versions = new Set(Object.values(MANIFEST_VERSIONS));
  const [only] = versions;
  if (versions.size !== 1 || only === undefined) {
    throw new Error(
      `build/browser-targets.toml: every browser must target one Manifest version, got ${[...versions].join(', ')}`,
    );
  }
  return only;
}

/** A browser build's folder under `dist/`, as WXT names it: `firefox-mv3`. */
export function buildFolder(browser: SupportedBrowser): string {
  return `${browser}-mv${MANIFEST_VERSIONS[browser]}`;
}
