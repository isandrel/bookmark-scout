/**
 * Parser-free config assembly and validation, shared by the extension and the Bun TOML loader.
 * File namespaces, one owner per path, strict schemas, and frozen values apply to both callers.
 */
import type { z } from 'zod';
import { isPlainObject } from '../utils';

/** Parsed TOML tables keyed by their paths relative to config/, e.g. `ai/agent.toml`. */
export type ParsedConfigFiles = Readonly<Record<string, Record<string, unknown>>>;

export type ConfigTree = Readonly<Record<string, unknown>>;

export type ConfigReader = {
  /**
   * Validates and returns the config at `path` (a file or directory under config/, without the
   * .toml extension). Each path may be read once; two readers may not claim overlapping paths.
   */
  read: <S extends z.ZodType>(path: string, schema: S) => z.output<S>;
  /** Paths claimed so far, in the order they were read. */
  claims: () => readonly string[];
};

const TOML_EXTENSION = /\.toml$/;

/** `settings/ai-tools.toml` or `settings/ai-tools` -> settings, ai_tools. */
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
 * Places each file at its namespace, rejecting duplicate or nested file paths before resolving
 * that file's content. Bun supplies the TOML parser; the extension supplies already parsed data.
 */
export function assembleConfigTree<T>(
  files: Readonly<Record<string, T>>,
  readContent: (content: T, file: string) => Record<string, unknown>,
): ConfigTree {
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

    const content = readContent(files[file], file);
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

/** Assembles data compiled from TOML while retaining namespace checks and deep freezing. */
export function loadParsedAppConfig(files: ParsedConfigFiles): ConfigTree {
  return assembleConfigTree(files, (content) => content);
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
