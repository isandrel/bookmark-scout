/**
 * Pure loader for the extension's config tree (apps/extension/config/**.toml). It uses explicit
 * imports only (no WXT auto-imports or Vite globs), so Bun scripts can use it as well as the
 * extension (src/lib/app-config.ts).
 *
 * A file's path is its namespace: `settings/tools/dead-links.toml` becomes
 * `settings.tools.dead_links` (kebab-case names become snake_case keys). Two files may not claim
 * overlapping paths, every value is frozen, and each module that owns a file reads it once through
 * a strict zod schema, so typos and unknown keys fail at load time.
 */
import { parse } from 'smol-toml';
import type { z } from 'zod';
import { isPlainObject } from '../utils';

/** Raw TOML text keyed by its path relative to `config/`, e.g. `ai/agent.toml`. */
export type ConfigFiles = Readonly<Record<string, string>>;

export type ConfigTree = Readonly<Record<string, unknown>>;

export type ConfigReader = {
  /**
   * Validates and returns the config at `path` (a file or directory under `config/`, without the
   * `.toml` extension, e.g. `ai/agent` or `ai/providers`). Each path may be read once, and two
   * readers may not claim overlapping paths, so every value has exactly one owner.
   */
  read: <S extends z.ZodType>(path: string, schema: S) => z.output<S>;
  /** Paths claimed so far, in the order they were read. */
  claims: () => readonly string[];
};

const TOML_EXTENSION = /\.toml$/;

/** `settings/tools/dead-links.toml` or `settings/tools/dead-links` -> settings, tools, dead_links. */
export function configPathSegments(path: string): string[] {
  const segments = path
    .replace(TOML_EXTENSION, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) throw new Error(`Config path "${path}" names no file`);
  return segments.map((segment) => {
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(segment)) {
      throw new Error(`Config path "${path}": "${segment}" must be kebab-case`);
    }
    return segment.replace(/-/g, '_');
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** True when one dotted path equals the other or contains it. */
function overlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

/**
 * Parses every file and places it at the path its file name gives. Throws when a file is not
 * valid TOML or when two files claim the same or nested paths (`settings/tools.toml` and
 * `settings/tools/dead-links.toml`).
 */
export function loadAppConfig(files: ConfigFiles): ConfigTree {
  const root: Record<string, unknown> = {};
  const owners = new Map<string, string>();
  for (const file of Object.keys(files).sort()) {
    const segments = configPathSegments(file);
    const dotted = segments.join('.');
    for (const [claimed, owner] of owners) {
      if (overlaps(dotted, claimed)) {
        throw new Error(`Config files ${owner} and ${file} both define "${dotted}"`);
      }
    }
    owners.set(dotted, file);

    let content: Record<string, unknown>;
    try {
      content = parse(files[file]);
    } catch (error) {
      throw new Error(`Config file ${file} is not valid TOML: ${(error as Error).message}`);
    }
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      const next = node[segment] ?? {};
      if (!isPlainObject(next)) throw new Error(`Config file ${file}: "${segment}" is not a table`);
      node[segment] = next;
      node = next;
    }
    node[segments[segments.length - 1]] = content;
  }
  return deepFreeze(root);
}

/** Reads validated values out of a loaded tree and records which module owns which path. */
export function createConfigReader(tree: ConfigTree): ConfigReader {
  const claimed: string[] = [];
  return {
    read(path, schema) {
      const segments = configPathSegments(path);
      const dotted = segments.join('.');
      const conflict = claimed.find((other) => overlaps(dotted, other));
      if (conflict !== undefined) {
        throw new Error(`Config "${dotted}" is already read as "${conflict}"; give it one owner`);
      }
      let node: unknown = tree;
      for (const segment of segments) node = isPlainObject(node) ? node[segment] : undefined;
      if (node === undefined) throw new Error(`Config "${path}" has no file under config/`);
      const result = schema.safeParse(node);
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => `${[dotted, ...issue.path].join('.')}: ${issue.message}`)
          .join('; ');
        throw new Error(`Invalid config "${path}": ${issues}`);
      }
      claimed.push(dotted);
      return deepFreeze(result.data);
    },
    claims: () => [...claimed],
  };
}
