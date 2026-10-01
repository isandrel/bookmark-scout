import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/settings-schema';
import { settingsMatrix } from '../settings-matrix';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_TITLE = /^\s*(?:test|it)(?:\.only)?\(\s*(['"`])((?:\\.|(?!\1).)+)\1/gm;

function testTitles(file: string): Set<string> {
  const source = readFileSync(file, 'utf8');
  return new Set([...source.matchAll(TEST_TITLE)].map((match) => match[2].replace(/\\(.)/g, '$1')));
}

describe('settings behavior matrix', () => {
  const entries = Object.entries(settingsMatrix);

  it('covers every setting in the schema and nothing else', () => {
    expect(Object.keys(settingsMatrix).sort()).toEqual(Object.keys(defaultSettings).sort());
  });

  it('names a consumer that reads each supported setting', () => {
    const problems = entries.flatMap(([key, entry]) => {
      if (!entry.consumer) return entry.status === 'tested' ? [`${key}: no consumer`] : [];
      const file = path.join(appRoot, 'src', entry.consumer);
      if (!existsSync(file)) return [`${key}: ${entry.consumer} does not exist`];
      return new RegExp(`\\b${key}\\b`).test(readFileSync(file, 'utf8'))
        ? []
        : [`${key}: ${entry.consumer} never mentions it`];
    });
    expect(problems).toEqual([]);
  });

  it('points every supported setting at existing test titles', () => {
    const titleCache = new Map<string, Set<string>>();
    const problems = entries.flatMap(([key, entry]) => {
      if (entry.status === 'tested' && entry.tests.length === 0) return [`${key}: no tests`];
      if (entry.status !== 'tested' && !entry.reason.trim()) return [`${key}: no reason`];
      return (entry.tests ?? []).flatMap((ref) => {
        const file = path.join(appRoot, 'tests', ref.kind, ref.file);
        if (!existsSync(file)) return [`${key}: ${ref.kind}/${ref.file} does not exist`];
        if (!titleCache.has(file)) titleCache.set(file, testTitles(file));
        return titleCache.get(file)?.has(ref.title)
          ? []
          : [`${key}: no test titled "${ref.title}" in ${ref.kind}/${ref.file}`];
      });
    });
    expect(problems).toEqual([]);
  });
});
