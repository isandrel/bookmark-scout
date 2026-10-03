import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatKilobytes, getErrorMessage, setLanguage } from '@/hooks/use-i18n';
import { BYTES_PER_KB, MS_PER_SECOND } from '@/lib/units';
import { getSettingsFieldMeta } from '@/lib/settings-schema';
import { ELLIPSIS, isPlainObject, isSameJson, truncateText } from '@/lib/utils';
import enMessages from '../../public/_locales/en/messages.json';
import jaMessages from '../../public/_locales/ja/messages.json';
import { appRoot } from '../config-files';

beforeEach(() => {
  setLanguage('en');
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('isPlainObject', () => {
  it('accepts objects and rejects arrays, null, and primitives', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject('text')).toBe(false);
    expect(isPlainObject(1)).toBe(false);
  });
});

describe('isSameJson', () => {
  it('compares by serialized JSON, so key order and undefined fields count as stored', () => {
    expect(isSameJson([1, 2], [1, 2])).toBe(true);
    expect(isSameJson({ a: 1, b: [2] }, { a: 1, b: [2] })).toBe(true);
    expect(isSameJson([1, 2], [2, 1])).toBe(false);
    expect(isSameJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
    expect(isSameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});

describe('getErrorMessage', () => {
  it('uses the error message, or a localized fallback for anything else', () => {
    expect(getErrorMessage(new Error('Disk full'))).toBe('Disk full');
    expect(getErrorMessage('not an error')).toBe(enMessages.error_unknown.message);
    expect(getErrorMessage(undefined, 'toast_exportFailed')).toBe(
      enMessages.toast_exportFailed.message,
    );
  });

  it('only names fallback keys that exist', () => {
    const missing = sourceFiles(path.join(appRoot, 'src')).flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /\bgetErrorMessage\([^,)]+,\s*['"]([A-Za-z0-9_]+)['"]/g,
        ),
      ]
        .map((match) => match[1])
        .filter((key) => !(key in enMessages)),
    );
    expect(missing).toEqual([]);
  });
});

describe('unit constants', () => {
  it('convert milliseconds and binary kilobytes', () => {
    expect(10_000 / MS_PER_SECOND).toBe(10);
    expect(BYTES_PER_KB).toBe(1024);
    expect(formatKilobytes(1536)).toBe('1.5 KB');
  });

  it('show units from the locale files in the selected language', () => {
    setLanguage('ja');
    expect(formatKilobytes(1536)).toBe(`1.5 ${jaMessages.unit_kb.message}`);
    const meta = getSettingsFieldMeta();
    expect(meta.searchDebounceMs.unit).toBe(jaMessages.unit_ms.message);
    expect(meta.truncateLength.unit).toBe(jaMessages.unit_chars.message);
    expect(meta.siteIconsMaxCacheKb.unit).toBe(jaMessages.unit_kb.message);
  });
});

describe('truncateText', () => {
  it('cuts text longer than the limit and marks it with an ellipsis', () => {
    expect(truncateText('abcdef', 3)).toBe(`abc${ELLIPSIS}`);
    expect(truncateText('abc', 3)).toBe('abc');
  });
});
