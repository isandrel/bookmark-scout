/**
 * The extension's config tree, loaded once from apps/extension/config/**.toml at build time.
 *
 * To add a config file: create `config/<area>/<name>.toml`, then in the module that owns it call
 * `readConfig('<area>/<name>', z.strictObject({ ... }))` once, at module level, with a string
 * literal path. `tests/unit/app-config.test.ts` fails when a file has no reader or two readers.
 */
import { createConfigReader, loadParsedAppConfig, type ParsedConfigFiles } from './config/runtime';

const CONFIG_PREFIX = '../../config/';

// The shared Vite plugin parses TOML in dev, builds, and Vitest. Raw text and its parser never
// reach the extension, but owning modules still validate all values with their strict schemas.
const parsedFiles: ParsedConfigFiles = import.meta.glob('../../config/**/*.toml', {
  query: '?bookmark-scout-config',
  import: 'default',
  eager: true,
});

const files: ParsedConfigFiles = Object.fromEntries(
  Object.entries(parsedFiles).map(([file, content]) => [file.slice(CONFIG_PREFIX.length), content]),
);

const reader = createConfigReader(loadParsedAppConfig(files));

/** Validated, frozen config at `path` (a file or directory under `config/`, no extension). */
export const readConfig = reader.read;

/** Config paths read so far, for the coverage test. */
export const getConfigClaims = reader.claims;
