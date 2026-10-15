import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { parse, TomlDate } from 'smol-toml';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createConfigReader, loadAppConfig } from '@/lib/config/loader';
import { loadParsedAppConfig, type ParsedConfigFiles } from '@/lib/config/runtime';
import { compileTomlConfig, tomlConfig } from '../../build/toml-config';
import { appRoot, readConfigTomlFiles } from '../config-files';

/** Evaluate only the local compiler's data expression in a fresh test context. */
function evaluateCompiled(text: string, file = 'test.toml'): Record<string, unknown> {
  const code = compileTomlConfig(text, file);
  const expression = code.slice('export default '.length).trim().replace(/;$/, '');
  return runInNewContext(`(${expression})`) as Record<string, unknown>;
}

function expectSameData(actual: unknown, expected: unknown): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    const array = actual as unknown[];
    expect(array).toHaveLength(expected.length);
    expected.forEach((value, index) => {
      expectSameData(array[index], value);
    });
  } else if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object').toBe(true);
    // smol-toml tables have null prototypes, including inline and nested tables. Preserve
    // that distinction so inherited properties cannot become configuration keys.
    expect(Object.getPrototypeOf(actual)).toBe(Object.getPrototypeOf(expected));
    const table = actual as Record<string, unknown>;
    expect(Object.keys(table)).toEqual(Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) expectSameData(table[key], value);
  } else {
    expect(Object.is(actual, expected)).toBe(true);
  }
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

const CONFIG_PREFIX = '../../config/';
const modules: ParsedConfigFiles = import.meta.glob('../../config/**/*.toml', {
  query: '?bookmark-scout-config',
  import: 'default',
  eager: true,
});
const parsedFiles: ParsedConfigFiles = Object.fromEntries(
  Object.entries(modules).map(([file, content]) => [file.slice(CONFIG_PREFIX.length), content]),
);

describe('build-time TOML configuration', () => {
  it('keeps every repository file and its exact parsed data in Vite imports', () => {
    const rawFiles = readConfigTomlFiles();
    expect(Object.keys(parsedFiles).sort()).toEqual(Object.keys(rawFiles).sort());
    for (const [file, text] of Object.entries(rawFiles)) {
      expectSameData(parsedFiles[file], parse(text));
      expectSameData(evaluateCompiled(text, file), parse(text));
    }
    const compiledTree = loadParsedAppConfig(parsedFiles);
    expect(compiledTree).toStrictEqual(loadAppConfig(rawFiles));
    expectDeepFrozen(compiledTree);
  });

  it('preserves strings, tables, arrays, signed zero, and non-finite numbers', () => {
    const text = `
text = '''Quotes: " ' \\ and multilingual 中文 日本語 한국어 🧭'''
positive = inf
negative = -inf
not_a_number = nan
signed_zero = -0.0
values = [true, false, 1.25, -2, "line\\nnext"]
inline = { one = 1, two = [2, 3] }
[[tables]]
name = "one"
[[tables]]
name = "two"
`;
    expectSameData(evaluateCompiled(text), parse(text));
  });

  it('keeps special table keys as own data without changing the prototype', () => {
    const text = `
"__proto__" = { polluted = true }
"constructor" = "plain text"
"toString" = "another key"
`;
    const compiled = evaluateCompiled(text);
    expectSameData(compiled, parse(text));
    expect(Object.hasOwn(compiled, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(compiled)).toBeNull();
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });

  it.each(['1979-05-27T07:32:00Z', '1979-05-27T07:32:00', '1979-05-27', '07:32:00'])(
    'rejects unsupported date/time %s without changing the Bun loader',
    (value) => {
      const text = `[schedule]\nat = ${value}`;
      expect(() => compileTomlConfig(text, 'ui/schedule.toml')).toThrow(
        /Unsupported TOML value at ui\/schedule\.toml\.schedule\.at.*date\/time/,
      );
      const rawTree = loadAppConfig({ 'ui/schedule.toml': text });
      expect(rawTree).toHaveProperty('ui.schedule.schedule.at', expect.any(TomlDate));
    },
  );

  it('names malformed TOML files at compile time', () => {
    expect(() => compileTomlConfig('max_steps = ', 'ai/agent.toml')).toThrow(
      /Config file ai\/agent\.toml is not valid TOML/,
    );
  });

  it('retains namespace conflicts and strict, single-owner runtime validation', () => {
    expect(() => loadParsedAppConfig({ 'ui/my-toasts.toml': {}, 'ui/my_toasts.toml': {} })).toThrow(
      /both define "ui.my_toasts"/,
    );
    expect(() =>
      loadParsedAppConfig({ 'settings/tools.toml': {}, 'settings/tools/dead-links.toml': {} }),
    ).toThrow(/both define/);
    expect(() => loadParsedAppConfig({ 'ai/Agent Config.toml': {} })).toThrow(/kebab-case/);

    const reader = createConfigReader(
      loadParsedAppConfig({ 'ai/agent.toml': evaluateCompiled('max_steps = 8') }),
    );
    const schema = z.strictObject({ max_steps: z.number().int().positive() });
    const value = reader.read('ai/agent', schema);
    expect(value).toEqual({ max_steps: 8 });
    expectDeepFrozen(value);
    expect(() => reader.read('ai', z.unknown())).toThrow(/already read/);

    const typo = loadParsedAppConfig({
      'ai/agent.toml': evaluateCompiled('max_steps = 8\nmax_stpes = 9'),
    });
    expect(() => createConfigReader(typo).read('ai/agent', schema)).toThrow(/max_stpes/);
    const wrong = loadParsedAppConfig({ 'ai/agent.toml': evaluateCompiled('max_steps = "eight"') });
    expect(() => createConfigReader(wrong).read('ai/agent', schema)).toThrow(
      /ai\.agent\.max_steps/,
    );
  });

  it('ships data modules with neither the parser nor TOML source comments', async () => {
    const result = await build({
      root: appRoot,
      configFile: false,
      publicDir: false,
      plugins: [tomlConfig()],
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry: path.join(appRoot, 'src/lib/app-config.ts'), formats: ['es'] },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs
      .flatMap((output) => output.output)
      .filter((item) => item.type === 'chunk');
    expect(chunks.length).toBeGreaterThan(0);
    const ids = chunks.flatMap((chunk) => Object.keys(chunk.modules));
    expect(ids.some((id) => id.includes('.toml?bookmark-scout-config'))).toBe(true);
    expect(ids.filter((id) => /smol-toml|\/config\/loader\.ts/.test(id))).toEqual([]);
    const code = chunks.map((chunk) => chunk.code).join('\n');
    expect(code).not.toContain('# Built-in AI prompts and the rules the app adds after them.');
    expect(code).toContain('max_steps');
  }, 30_000);
});
