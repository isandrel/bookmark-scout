import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatBundledMessage } from '@/hooks/use-i18n';

type LocaleMessage = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string }>;
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const locales = ['en', 'ja', 'ko'] as const;

function readLocale(locale: string): { raw: string; messages: Record<string, LocaleMessage> } {
  const raw = readFileSync(path.join(appRoot, 'public/_locales', locale, 'messages.json'), 'utf8');
  return { raw, messages: JSON.parse(raw) };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const byLocale = Object.fromEntries(locales.map((locale) => [locale, readLocale(locale)]));

describe('extension locale messages', () => {
  it.each(locales)('%s has no duplicate top-level keys', (locale) => {
    const keys = [...byLocale[locale].raw.matchAll(/^ {4}"([^"]+)":/gm)].map((match) => match[1]);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it.each(['ja', 'ko'] as const)('%s has the same key set as en', (locale) => {
    const enKeys = Object.keys(byLocale.en.messages).sort();
    expect(Object.keys(byLocale[locale].messages).sort()).toEqual(enKeys);
  });

  it.each(locales)('%s defines every $NAME$ placeholder a message uses', (locale) => {
    const undefinedPlaceholders = Object.entries(byLocale[locale].messages).flatMap(
      ([key, entry]) => {
        const defined = new Set(
          Object.keys(entry.placeholders ?? {}).map((name) => name.toLowerCase()),
        );
        return [...entry.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)]
          .map((match) => match[1].toLowerCase())
          .filter((name) => !defined.has(name))
          .map((name) => `${key}: $${name}$`);
      },
    );
    expect(undefinedPlaceholders).toEqual([]);
  });

  it.each(['ja', 'ko'] as const)('%s uses the same placeholders as en', (locale) => {
    const tokens = (message: string) =>
      [...message.matchAll(/\$([A-Za-z0-9_@]+)\$|\$[1-9]/g)].map((match) => match[0]).sort();
    const mismatched = Object.entries(byLocale.en.messages)
      .filter(([key, entry]) => {
        const translated = byLocale[locale].messages[key]?.message ?? '';
        return JSON.stringify(tokens(translated)) !== JSON.stringify(tokens(entry.message));
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('every literal t() key used in src exists in en', () => {
    const missing = sourceFiles(path.join(appRoot, 'src')).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/\bt\(\s*['"]([A-Za-z0-9_]+)['"]/g)]
        .map((match) => match[1])
        .filter((key) => !(key in byLocale.en.messages))
        .map((key) => `${path.relative(appRoot, file)}: ${key}`);
    });
    expect(missing).toEqual([]);
  });
});

describe('formatBundledMessage', () => {
  it('fills named placeholders from substitutions in any translated order', () => {
    expect(formatBundledMessage(byLocale.en.messages.tools_duplicatesDialogDesc, ['2', '40'])).toBe(
      '2 duplicate groups found across 40 bookmarks',
    );
    expect(formatBundledMessage(byLocale.ja.messages.tools_duplicatesDialogDesc, ['2', '40'])).toBe(
      '40 件のブックマークから 2 個の重複グループが見つかりました',
    );
    expect(formatBundledMessage(byLocale.en.messages.tools_urlCleanerDialogDesc, '3')).toBe(
      '3 bookmarks can be cleaned',
    );
  });

  it('supports direct $1 substitutions and $$ escapes', () => {
    expect(formatBundledMessage({ message: 'Import failed: $1 ($$)' }, 'bad file')).toBe(
      'Import failed: bad file ($)',
    );
  });
});

describe('plural message variants', () => {
  it('every tPlural() key has a singular _one variant with matching placeholders', () => {
    const problems = sourceFiles(path.join(appRoot, 'src')).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/\btPlural\(\s*['"]([A-Za-z0-9_]+)['"]/g)]
        .map((match) => match[1])
        .filter((key) => {
          const many = byLocale.en.messages[key];
          const one = byLocale.en.messages[`${key}_one`];
          return (
            !many ||
            !one ||
            JSON.stringify(Object.keys(many.placeholders ?? {}).sort()) !==
              JSON.stringify(Object.keys(one.placeholders ?? {}).sort())
          );
        });
    });
    expect(problems).toEqual([]);
  });

  it('uses singular English for a count of one', () => {
    expect(formatBundledMessage(byLocale.en.messages.tools_urlCleanerDialogDesc_one, '1')).toBe(
      '1 bookmark can be cleaned',
    );
  });
});
