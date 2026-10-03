/**
 * The extension's config tree, loaded once from apps/extension/config/**.toml at build time.
 *
 * To add a config file: create `config/<area>/<name>.toml`, then in the module that owns it call
 * `readConfig('<area>/<name>', z.strictObject({ ... }))` once, at module level, with a string
 * literal path. `tests/unit/app-config.test.ts` fails when a file has no reader or two readers.
 */
import { type ConfigFiles, createConfigReader, loadAppConfig } from './config/loader';

const CONFIG_PREFIX = '../../config/';

const rawFiles: Record<string, string> = import.meta.glob('../../config/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const files: ConfigFiles = Object.fromEntries(
  Object.entries(rawFiles).map(([file, text]) => [file.slice(CONFIG_PREFIX.length), text]),
);

const reader = createConfigReader(loadAppConfig(files));

/** Validated, frozen config at `path` (a file or directory under `config/`, no extension). */
export const readConfig = reader.read;

/** Config paths read so far, for the coverage test. */
export const getConfigClaims = reader.claims;
