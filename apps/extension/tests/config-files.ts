/**
 * Reads apps/extension/config/ straight from disk, so tests check consumers against the files
 * themselves instead of against the loader under test.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const configRoot = path.join(appRoot, 'config');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Every file under config/, relative to it, e.g. `ai/agent.toml`. */
export function listConfigFiles(): string[] {
  return listFiles(configRoot)
    .map((file) => path.relative(configRoot, file).split(path.sep).join('/'))
    .sort();
}

/** Raw text of every TOML file under config/, keyed by its path relative to config/. */
export function readConfigTomlFiles(): Record<string, string> {
  return Object.fromEntries(
    listConfigFiles()
      .filter((file) => file.endsWith('.toml'))
      .map((file) => [file, readFileSync(path.join(configRoot, file), 'utf8')]),
  );
}

/** One parsed TOML file, e.g. `readConfigToml('ai/agent.toml')`. */
export function readConfigToml(file: string): Record<string, unknown> {
  return parse(readFileSync(path.join(configRoot, file), 'utf8'));
}
