/**
 * Compile ?bookmark-scout-config TOML imports to data modules in dev, production, and Vitest.
 * Parsing stays in the build process; namespace, ownership, and schema validation stay in the
 * runtime loader. Keep this plugin in both wxt.config.ts and vitest.config.ts: WxtVitest does
 * not inherit user Vite plugins from WXT's config.
 */
import { readFile } from 'node:fs/promises';
import { parse } from 'smol-toml';
import type { Plugin } from 'vite';

const CONFIG_QUERY = 'bookmark-scout-config';

/**
 * Emit JavaScript data rather than JSON: TOML has signed zero, non-finite numbers, and tables
 * with null prototypes. JSON would silently change those values. Date/time objects have no
 * consumers in the current config tree; fail clearly instead of turning them into strings.
 */
function serializeValue(value: unknown, location: string): string {
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return '-0';
    if (Number.isNaN(value)) return '(0/0)';
    if (value === Number.POSITIVE_INFINITY) return '(1/0)';
    if (value === Number.NEGATIVE_INFINITY) return '(-1/0)';
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => serializeValue(item, `${location}[${index}]`)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) {
      const entries = Object.entries(value).map(([key, child]) => {
        // A __proto__ data key must not become an object-literal prototype initializer.
        const name = key === '__proto__' ? `[${JSON.stringify(key)}]` : JSON.stringify(key);
        return `${name}:${serializeValue(child, `${location}.${key}`)}`;
      });
      if (prototype === null) entries.unshift('__proto__:null');
      return `{${entries.join(',')}}`;
    }
  }
  throw new Error(
    `Unsupported TOML value at ${location} (${Object.prototype.toString.call(value)}). ` +
      'Use quoted strings for date/time values or add type-preserving serialization.',
  );
}

/** Compiles a file without imports, eval, or runtime TOML parsing. */
export function compileTomlConfig(text: string, file: string): string {
  let content: Record<string, unknown>;
  try {
    content = parse(text);
  } catch (error) {
    throw new Error(`Config file ${file} is not valid TOML: ${(error as Error).message}`);
  }
  return `export default ${serializeValue(content, file)};\n`;
}

export function tomlConfig(): Plugin {
  return {
    name: 'bookmark-scout:toml-config',
    enforce: 'pre',
    async load(id) {
      const queryStart = id.indexOf('?');
      if (queryStart === -1) return null;
      const file = id.slice(0, queryStart);
      const query = new URLSearchParams(id.slice(queryStart + 1));
      if (!file.endsWith('.toml') || !query.has(CONFIG_QUERY)) return null;
      this.addWatchFile(file);
      return {
        code: compileTomlConfig(await readFile(file, 'utf8'), file),
        map: null,
      };
    },
  };
}
