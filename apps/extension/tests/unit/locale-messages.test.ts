import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'smol-toml';
import {
  FALLBACK_LOCALE,
  formatBundledMessage,
  getLanguageName,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  toLanguageTag,
} from '@/hooks/use-i18n';

type LocaleMessage = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string }>;
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const locales = SUPPORTED_LOCALES;

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
const translated = locales.filter((locale) => locale !== FALLBACK_LOCALE);

/** Every tPlural() key used in src. */
const pluralKeys = [
  ...new Set(
    sourceFiles(path.join(appRoot, 'src')).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\btPlural\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map(
        (match) => match[1],
      ),
    ),
  ),
];
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many'] as const;

/** The plural forms a locale needs besides 'other': those whole counts up to 1,000 select. */
function neededPluralCategories(locale: SupportedLocale): string[] {
  const rules = new Intl.PluralRules(toLanguageTag(locale));
  const categories = new Set(Array.from({ length: 1001 }, (_, count) => rules.select(count)));
  return PLURAL_CATEGORIES.filter((category) => categories.has(category));
}

/** The keys a locale must define: English's, plus its own plural forms, minus forms it lacks. */
function expectedKeys(locale: SupportedLocale): string[] {
  const needed = new Set(neededPluralCategories(locale));
  const pluralForms = pluralKeys.flatMap((key) =>
    PLURAL_CATEGORIES.map((category) => [`${key}_${category}`, category] as const),
  );
  const own = byLocale[locale].messages;
  const keys = new Set(Object.keys(byLocale.en.messages));
  for (const [form, category] of pluralForms) {
    // A form the language needs is required; one it does not need may be kept (ja and ko keep _one).
    if (needed.has(category)) keys.add(form);
    else if (!(form in own)) keys.delete(form);
  }
  return [...keys].sort();
}

describe('extension locale messages', () => {
  it.each(locales)('%s has no duplicate top-level keys', (locale) => {
    const keys = [...byLocale[locale].raw.matchAll(/^ {4}"([^"]+)":/gm)].map((match) => match[1]);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it.each(translated)('%s has the same key set as en, plus its own plural forms', (locale) => {
    expect(Object.keys(byLocale[locale].messages).sort()).toEqual(expectedKeys(locale));
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

  it.each(translated)('%s uses the same placeholders as en', (locale) => {
    const tokens = (message: string) =>
      [...message.matchAll(/\$([A-Za-z0-9_@]+)\$|\$[1-9]/g)].map((match) => match[0]).sort();
    // A plural form English lacks (_few) is compared with its base key.
    const english = (key: string) =>
      byLocale.en.messages[key] ?? byLocale.en.messages[key.replace(/_(zero|one|two|few|many)$/, '')];
    const mismatched = Object.entries(byLocale[locale].messages)
      .filter(([key, entry]) => {
        const source = english(key);
        return source && JSON.stringify(tokens(entry.message)) !== JSON.stringify(tokens(source.message));
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

  it.each(locales)('%s defines every plural form its language needs', (locale) => {
    const messages = byLocale[locale].messages;
    const missing = pluralKeys.flatMap((key) =>
      neededPluralCategories(locale)
        .map((category) => `${key}_${category}`)
        .filter((form) => !(form in messages)),
    );
    expect(missing).toEqual([]);
  });

  it('uses singular English for a count of one', () => {
    expect(formatBundledMessage(byLocale.en.messages.tools_urlCleanerDialogDesc_one, '1')).toBe(
      '1 bookmark can be cleaned',
    );
  });
});

describe('bundled locales', () => {
  const project = parse(readFileSync(path.join(appRoot, '../../config/project.toml'), 'utf8')) as {
    locales: {
      default: string;
      supported: string[];
      extension: string[];
      names: Record<string, string>;
    };
  };

  it('are the _locales folders, each named by the SupportedLocale type', () => {
    const folders = readdirSync(path.join(appRoot, 'public/_locales')).sort();
    expect([...SUPPORTED_LOCALES]).toEqual(folders);
    // A new folder needs its code in the type too (excess keys fail type checking).
    const typed = { en: true, ja: true, ko: true } satisfies Record<SupportedLocale, true>;
    expect([...SUPPORTED_LOCALES]).toEqual(Object.keys(typed));
  });

  it('are the workspace extension locales, with the workspace default as the fallback', () => {
    expect(SUPPORTED_LOCALES.map(toLanguageTag).sort()).toEqual([...project.locales.extension].sort());
    expect(FALLBACK_LOCALE).toBe(project.locales.default);
  });

  it('name each language in its own words, as the workspace config does for the website', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const name = project.locales.names[toLanguageTag(locale)];
      if (name !== undefined) expect(getLanguageName(locale)).toBe(name);
    }
  });
});
