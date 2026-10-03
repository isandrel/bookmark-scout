import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { configPathSegments, createConfigReader, loadAppConfig } from '@/lib/config/loader';
import { appRoot, listConfigFiles, readConfigTomlFiles } from '../config-files';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Modules that call readConfig(...), the owners of the config files. */
const ownerModules = sourceFiles(path.join(appRoot, 'src')).filter(
  (file) =>
    !file.endsWith(path.join('lib', 'app-config.ts')) &&
    /\breadConfig\(/.test(readFileSync(file, 'utf8')),
);

afterEach(() => {
  vi.doUnmock('@/lib/app-config');
  vi.resetModules();
});

describe('config loader', () => {
  it('loads every config file in the repository', () => {
    const tree = loadAppConfig(readConfigTomlFiles());
    expect(tree).toHaveProperty('settings.tools.dead_links.enabled', true);
    expect(tree).toHaveProperty('ai.providers.openai.name', 'OpenAI');
    expect(Object.isFrozen(tree)).toBe(true);
  });

  it('places a file at the path its name gives, with kebab-case as snake_case', () => {
    expect(configPathSegments('settings/tools/dead-links.toml')).toEqual([
      'settings',
      'tools',
      'dead_links',
    ]);
    const tree = loadAppConfig({ 'settings/tools/dead-links.toml': 'enabled = true' });
    expect(tree).toEqual({ settings: { tools: { dead_links: { enabled: true } } } });
  });

  it('throws when two files claim the same path', () => {
    expect(() =>
      loadAppConfig({ 'ui/my-toasts.toml': 'a = 1', 'ui/my_toasts.toml': 'b = 1' }),
    ).toThrow(/both define "ui.my_toasts"/);
  });

  it('throws when one file is nested inside another file’s path', () => {
    expect(() =>
      loadAppConfig({
        'settings/tools.toml': '[dead_links]\nenabled = true',
        'settings/tools/dead-links.toml': 'retry_count = 1',
      }),
    ).toThrow(/both define/);
  });

  it('names the file that is not valid TOML', () => {
    expect(() => loadAppConfig({ 'ai/agent.toml': 'max_steps = ' })).toThrow(/ai\/agent\.toml/);
  });

  it('rejects file names that are not kebab-case', () => {
    expect(() => loadAppConfig({ 'ai/Agent Config.toml': 'a = 1' })).toThrow(/kebab-case/);
  });
});

describe('config reader', () => {
  const tree = loadAppConfig({
    'ai/agent.toml': 'max_steps = 8',
    'ai/activity.toml': 'max_entries = 50',
  });
  const strict = z.strictObject({ max_steps: z.number().int().positive() });

  it('returns validated, frozen values', () => {
    const reader = createConfigReader(tree);
    const config = reader.read('ai/agent', strict);
    expect(config).toEqual({ max_steps: 8 });
    expect(Object.isFrozen(config)).toBe(true);
    expect(reader.claims()).toEqual(['ai.agent']);
  });

  it('rejects unknown keys through a strict schema', () => {
    const typo = loadAppConfig({ 'ai/agent.toml': 'max_steps = 8\nmax_stpes = 9' });
    expect(() => createConfigReader(typo).read('ai/agent', strict)).toThrow(
      /Invalid config "ai\/agent".*max_stpes/,
    );
  });

  it('rejects a value of the wrong type with its full path', () => {
    const wrong = loadAppConfig({ 'ai/agent.toml': 'max_steps = "eight"' });
    expect(() => createConfigReader(wrong).read('ai/agent', strict)).toThrow(
      /ai\.agent\.max_steps/,
    );
  });

  it('allows one owner per path', () => {
    const reader = createConfigReader(tree);
    reader.read('ai/agent', strict);
    expect(() => reader.read('ai/agent', strict)).toThrow(/already read/);
    expect(() => reader.read('ai', z.unknown())).toThrow(/already read/);
  });

  it('fails for a path without a file', () => {
    expect(() => createConfigReader(tree).read('ai/missing', z.unknown())).toThrow(/no file/);
  });
});

describe('config ownership', () => {
  it('has every config file read by exactly one module', async () => {
    expect(ownerModules.length).toBeGreaterThan(0);
    vi.resetModules();
    for (const file of ownerModules) await import(/* @vite-ignore */ file);
    // The owners above share this fresh instance of the loader and its claims.
    const claims = (await import('@/lib/app-config')).getConfigClaims();
    const problems = listConfigFiles()
      .filter((file) => file.endsWith('.toml'))
      .flatMap((file) => {
        const dotted = configPathSegments(file).join('.');
        const owners = claims.filter((claim) => dotted === claim || dotted.startsWith(`${claim}.`));
        return owners.length === 1 ? [] : [`${file}: read by ${owners.length} modules`];
      });
    expect(problems).toEqual([]);
    // Importing every owner module afresh takes several seconds on a busy machine.
  }, 30_000);

  it('keeps config/ to TOML files plus the generated provider catalog', () => {
    expect(listConfigFiles().filter((file) => !file.endsWith('.toml'))).toEqual([
      'provider-catalog.json',
    ]);
  });
});

describe('settings config', () => {
  it('keeps every numeric setting default inside its bounds', async () => {
    const { SETTING_NUMBER_BOUNDS, defaultSettings } = await import('@/lib/settings-schema');
    const entries = Object.entries(SETTING_NUMBER_BOUNDS);
    expect(entries.length).toBeGreaterThan(30);
    for (const [key, bounds] of entries) {
      const value = defaultSettings[key as keyof typeof defaultSettings];
      expect(value, key).toBe(bounds.default);
      if (!(bounds.unlimited && value === -1)) {
        expect(bounds.default, key).toBeGreaterThanOrEqual(bounds.min);
        expect(bounds.default, key).toBeLessThanOrEqual(bounds.max);
      }
    }
  });

  it('fails to load when a settings file has an unknown key', async () => {
    const files = readConfigTomlFiles();
    files['settings/search.toml'] += '\ndebounce_msec = 200\n';
    const reader = createConfigReader(loadAppConfig(files));
    vi.doMock('@/lib/app-config', () => ({
      readConfig: reader.read,
      getConfigClaims: reader.claims,
    }));
    await expect(import('@/lib/settings-schema')).rejects.toThrow(
      /Unknown config key settings\.search\.debounce_msec/,
    );
  });

  it('fails to load when a default is outside its bounds', async () => {
    const files = readConfigTomlFiles();
    files['settings/search.toml'] = files['settings/search.toml'].replace(
      'default = 300',
      'default = 5000',
    );
    const reader = createConfigReader(loadAppConfig(files));
    vi.doMock('@/lib/app-config', () => ({
      readConfig: reader.read,
      getConfigClaims: reader.claims,
    }));
    await expect(import('@/lib/settings-schema')).rejects.toThrow(
      /settings\.search\.debounce_ms: default is outside/,
    );
  });
});
