/**
 * The storage migrations registry (`src/lib/storage/migrations/index.ts`): what holds for every
 * migration, so removing one is deleting its module, its line in `MIGRATIONS`, and its tests.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { removeUnregisteredKeys } from '@/lib/storage/cleanup';
import { MIGRATIONS } from '@/lib/storage/migrations';
import { STORAGE_ITEMS, type StorageItem, storageAreaKey } from '@/lib/storage/registry';
import { toStoredEnvelope } from '@/lib/storage/stored-value';
import { appRoot } from '../../config-files';

const migrationsDir = path.join(appRoot, 'src/lib/storage/migrations');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** `[major, minor, patch]` of a plain `x.y.z` version. */
function versionParts(version: string): number[] {
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  return version.split('.').map(Number);
}

/** Negative when `a` comes before `b`, positive after, 0 when equal. */
function compareVersions(a: string, b: string): number {
  const [x, y] = [versionParts(a), versionParts(b)];
  return x.map((part, index) => part - y[index]).find((difference) => difference !== 0) ?? 0;
}

const packageVersion = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
  .version as string;

beforeEach(() => {
  fakeBrowser.reset();
});

describe('storage migrations', () => {
  it('each has a unique id, its own module and tests, and a removal version after it was added', () => {
    const ids = MIGRATIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const migration of MIGRATIONS) {
      expect(readdirSync(migrationsDir), migration.id).toContain(`${migration.id}.ts`);
      expect(readdirSync(path.join(appRoot, 'tests/unit/migrations')), migration.id).toContain(
        `${migration.id}.test.ts`,
      );
      expect(
        compareVersions(migration.removeAfter, migration.addedIn),
        migration.id,
      ).toBeGreaterThan(0);
    }
  });

  // Fails, rather than warns, so removal is never forgotten; it compares versions, not dates, so
  // it fails only in the change that raises the package version (a release), never on its own.
  it('carries no migration past its removal version', () => {
    const due = MIGRATIONS.filter(
      ({ removeAfter }) => compareVersions(packageVersion, removeAfter) >= 0,
    ).map(
      ({ id, removeAfter }) =>
        `${id} (removeAfter ${removeAfter}): delete src/lib/storage/migrations/${id}.ts, its line ` +
        `in MIGRATIONS, and tests/unit/migrations/${id}.test.ts, or move removeAfter on while the ` +
        'store dashboards still show installs from before it',
    );
    expect(due, `package version ${packageVersion}`).toEqual([]);
  });

  it('reads only old items the registry no longer lists, and names them nowhere else in src', () => {
    const registered = Object.values(STORAGE_ITEMS) as StorageItem[];
    const names = MIGRATIONS.flatMap(({ legacy }) => (legacy ? [legacy.item] : []));
    for (const item of names) {
      expect(
        registered.some((other) => other.area === item.area && other.name === item.name),
        item.name,
      ).toBe(false);
    }
    const found = sourceFiles(path.join(appRoot, 'src'))
      .filter((file) => !file.startsWith(`${migrationsDir}${path.sep}`))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return names
          .filter((item) =>
            new RegExp(`['"\`]${item.name.replaceAll('.', '\\.')}['"\`/]`).test(text),
          )
          .map((item) => `${path.relative(appRoot, file)}: ${item.name}`);
      });
    expect(found).toEqual([]);
  });

  it('keeps the old items they read through the install and update cleanup', async () => {
    const legacy = MIGRATIONS.flatMap(({ legacy: value }) => (value ? [value.item] : []));
    for (const item of legacy) {
      await fakeBrowser.storage[item.area].set({
        [storageAreaKey(item)]: toStoredEnvelope(item, {}),
      });
    }
    await fakeBrowser.storage.sync.set({ 'settings.gone': { v: 1, data: {} } });
    expect(await removeUnregisteredKeys()).toEqual({ sync: ['settings.gone'] });
    for (const item of legacy) {
      const key = storageAreaKey(item);
      expect(await fakeBrowser.storage[item.area].get(key), key).toHaveProperty(key);
    }
  });
});
