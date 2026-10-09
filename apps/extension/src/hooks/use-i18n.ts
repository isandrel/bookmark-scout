/**
 * Translation with the in-app Language setting.
 * When language = 'auto', or the browser's own locale: uses browser.i18n.getMessage
 * When another specific language: uses that locale's messages.json, loaded on demand
 *
 * No locale is bundled: each page and the background fetch only the selected locale's messages
 * from the extension's own `_locales/` files, and only when the browser does not already show
 * that locale. `t()` stays synchronous: a newly selected language is applied once its messages
 * have loaded, and until then `t()` keeps showing the previous one.
 */

import { useSyncExternalStore } from 'react';

export type BundledMessage = {
  message: string;
  placeholders?: Record<string, { content: string }>;
};

type LocaleMessages = Record<string, BundledMessage>;

// Only each locale's own name is bundled (JSON named imports are tree-shaken); the folder list
// under public/_locales is the list of supported locales.
const localeNameEntries = import.meta.glob<BundledMessage | undefined>(
  '../../public/_locales/*/messages.json',
  { eager: true, import: 'meta_languageName' },
);
const localeNames = Object.fromEntries(
  Object.entries(localeNameEntries).map(([file, name]) => [
    file.split('/').at(-2) as string,
    name?.message,
  ]),
);

/**
 * A language the extension ships messages for, named like its `_locales/` folder (`zh_CN`, with
 * an underscore). Types cannot list folders, so a new folder also goes here, and its language tag
 * in `config/project.toml` `[locales] extension`; tests/unit/locale-messages.test.ts fails until
 * both do.
 */
export type SupportedLocale =
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'ja'
  | 'ko'
  | 'pt_BR'
  | 'zh_CN'
  | 'zh_TW';

/** Bundled locales (one per `_locales/` folder) in the order the Language setting lists them. */
export const SUPPORTED_LOCALES = Object.keys(localeNames) as SupportedLocale[];

/** Shown when the browser language is not bundled; the manifest's `default_locale` (unit-tested). */
export const FALLBACK_LOCALE: SupportedLocale = 'en';

/** The Language setting's value for "follow the browser". */
export const AUTO_LANGUAGE = 'auto';

export type LanguagePreference = typeof AUTO_LANGUAGE | SupportedLocale;

/**
 * The standard (BCP 47) tag for a locale folder name: `zh_CN` is `zh-CN`. `Intl` and
 * `<html lang>` need the tag; `_locales/` and `browser.i18n` use the folder name.
 */
export function toLanguageTag(locale: SupportedLocale): string {
  return locale.replace('_', '-');
}

/**
 * Browser languages that belong to a different bundled locale than their own tag suggests:
 * Chinese scripts and regions. Keys and values are lowercase language tags.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  zh: 'zh-cn',
  'zh-hans': 'zh-cn',
  'zh-sg': 'zh-cn',
  'zh-hant': 'zh-tw',
  'zh-hk': 'zh-tw',
  'zh-mo': 'zh-tw',
};

/**
 * The bundled locale that best fits a browser language (`zh-HK`, `pt_PT`, `ja-JP`): the exact
 * tag, then an alias, then the language with its first subtag, then the language alone, then any
 * bundled locale of that language. Undefined when none is bundled.
 */
export function matchBundledLocale(
  language: string,
  locales: readonly SupportedLocale[] = SUPPORTED_LOCALES,
): SupportedLocale | undefined {
  const byTag = new Map(locales.map((locale) => [toLanguageTag(locale).toLowerCase(), locale]));
  const tag = language.toLowerCase().replaceAll('_', '-');
  const [base, second] = tag.split('-');
  const prefix = second ? `${base}-${second}` : base;
  const candidates = [tag, LANGUAGE_ALIASES[tag], prefix, LANGUAGE_ALIASES[prefix], base];
  for (const candidate of candidates) {
    const locale = candidate && byTag.get(candidate);
    if (locale) return locale;
  }
  return locales.find((locale) => toLanguageTag(locale).toLowerCase().split('-')[0] === base);
}

/**
 * Where a locale's messages are served from, relative to the extension root. `browser.runtime.
 * getURL` accepts only files under public/, so a locale without a folder is a type error.
 */
export function getLocaleMessagesPath<L extends SupportedLocale>(
  locale: L,
): `/_locales/${L}/messages.json` {
  return `/_locales/${locale}/messages.json`;
}

const loadedMessages: Partial<Record<SupportedLocale, LocaleMessages>> = {};
const pendingLoads = new Map<SupportedLocale, Promise<void>>();

/**
 * Makes a locale's messages available without loading them, for contexts that already have them
 * (unit tests register every locale up front, so they can switch languages synchronously).
 */
export function registerLocaleMessages(locale: SupportedLocale, messages: LocaleMessages): void {
  loadedMessages[locale] = messages;
}

async function fetchLocaleMessages(locale: SupportedLocale): Promise<LocaleMessages> {
  const response = await fetch(browser.runtime.getURL(getLocaleMessagesPath(locale)));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as LocaleMessages;
}

/**
 * Loads a locale's messages once per page. Never rejects: when loading fails, `t()` falls back
 * to `browser.i18n.getMessage`, and the next request tries again.
 */
function loadLocaleMessages(locale: SupportedLocale): Promise<void> {
  if (loadedMessages[locale]) return Promise.resolve();
  let pending = pendingLoads.get(locale);
  if (!pending) {
    pending = fetchLocaleMessages(locale)
      .then((messages) => {
        loadedMessages[locale] = messages;
      })
      .catch((error: unknown) => {
        settingsLogger.warn({ error, locale }, 'Could not load locale messages');
      })
      .finally(() => pendingLoads.delete(locale));
    pendingLoads.set(locale, pending);
  }
  return pending;
}

// The language `t()` shows, and the one most recently selected (they differ while it loads).
let currentLanguage: LanguagePreference = AUTO_LANGUAGE;
let requestedLanguage: LanguagePreference = AUTO_LANGUAGE;
// The locale whose loaded messages `t()` reads; undefined when `browser.i18n` serves them.
let messagesLocale: SupportedLocale | undefined;
let languageRevision = 0;
let languageReady: Promise<void> = Promise.resolve();
const languageListeners = new Set<() => void>();

function applyLanguage(language: LanguagePreference, locale: SupportedLocale | undefined) {
  if (currentLanguage === language && messagesLocale === locale) return;
  currentLanguage = language;
  messagesLocale = locale;
  languageRevision += 1;
  for (const listener of [...languageListeners]) listener();
}

/** The browser UI language (`zh-HK`), or undefined outside the extension (unit tests). */
function getUILanguage(): string | undefined {
  try {
    return browser.i18n.getUILanguage() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The bundled locale that fits the browser UI language (see `matchBundledLocale`), otherwise the
 * manifest's `default_locale`. Undefined outside the extension (unit tests).
 */
function getBrowserLocale(): SupportedLocale | undefined {
  const uiLanguage = getUILanguage();
  return uiLanguage === undefined
    ? undefined
    : (matchBundledLocale(uiLanguage) ?? FALLBACK_LOCALE);
}

/**
 * The locale `browser.i18n.getMessage` serves, by the browser's own rule: the folder named for
 * the UI language (`zh_TW`), then its language alone (`ja` for `ja-JP`), then `default_locale`.
 * It has no aliases, so `zh-HK` gets the default here while `getBrowserLocale` picks `zh_TW`.
 */
function getServedLocale(): SupportedLocale | undefined {
  const uiLanguage = getUILanguage();
  if (uiLanguage === undefined) return undefined;
  const tag = uiLanguage.toLowerCase().replaceAll('_', '-');
  const base = tag.split('-')[0];
  const byTag = (wanted: string) =>
    SUPPORTED_LOCALES.find((locale) => toLanguageTag(locale).toLowerCase() === wanted);
  return byTag(tag) ?? byTag(base) ?? FALLBACK_LOCALE;
}

/** The locale whose messages `t()` must load for a language, or undefined if the browser serves it. */
function localeToLoad(language: LanguagePreference): SupportedLocale | undefined {
  const locale = language === AUTO_LANGUAGE ? getBrowserLocale() : language;
  return locale && locale !== getServedLocale() ? locale : undefined;
}

/**
 * Select the language. Called by settings storage on load/change. Applies at once when `t()`
 * can already show it (a loaded locale, or the one `browser.i18n` serves), otherwise after its
 * messages load; `whenLanguageReady` waits for that. 'auto' loads messages too when the browser
 * language fits a bundled locale the browser itself would not serve (`zh-HK` uses `zh_TW`).
 */
export function setLanguage(language: LanguagePreference) {
  requestedLanguage = language;
  const locale = localeToLoad(language);
  if (!locale || loadedMessages[locale]) {
    applyLanguage(language, locale);
    languageReady = Promise.resolve();
    return;
  }
  languageReady = loadLocaleMessages(locale).then(() => {
    // A later selection wins over this one.
    if (requestedLanguage === language) applyLanguage(language, locale);
  });
}

/** Resolves once the selected language is applied, so `t()` returns its messages. */
export function whenLanguageReady(): Promise<void> {
  return languageReady;
}

/** Calls back after the language `t()` shows changes. */
export function subscribeToLanguage(listener: () => void): () => void {
  languageListeners.add(listener);
  return () => {
    languageListeners.delete(listener);
  };
}

/** A language's own name ("日本語"), from that locale's `meta_languageName` message. */
export function getLanguageName(locale: SupportedLocale): string {
  return localeNames[locale] ?? locale;
}

/**
 * The language `t()` currently shows: the selected language once its messages have loaded.
 */
export function getLanguage() {
  return currentLanguage;
}

/** The language `t()` shows, re-rendering the component after it changes. */
export function useLanguage(): LanguagePreference {
  return useSyncExternalStore(subscribeToLanguage, getLanguage, getLanguage);
}

/**
 * Counts changes to the messages `t()` shows, re-rendering the component after each. Unlike
 * `useLanguage`, it also changes when 'auto' starts showing loaded messages (`zh-HK` → `zh_TW`).
 */
export function useLanguageRevision(): number {
  return useSyncExternalStore(subscribeToLanguage, getLanguageRevision, getLanguageRevision);
}

function getLanguageRevision(): number {
  return languageRevision;
}

/**
 * The bundled language actually shown: the explicit setting, or for 'auto' the browser UI
 * language when it is one of the bundled locales, otherwise English.
 */
export function getResolvedLanguage(): SupportedLocale {
  if (currentLanguage !== AUTO_LANGUAGE) return currentLanguage;
  // Non-extension environments (tests) fall back to the default locale.
  return getBrowserLocale() ?? FALLBACK_LOCALE;
}

/**
 * Locale for dates and numbers: the selected language's tag (`zh-CN`; `Intl` rejects `zh_CN`),
 * or for 'auto' the browser UI language (undefined outside the extension, which means the
 * runtime default).
 */
export function getFormattingLocale(): string | undefined {
  if (currentLanguage !== AUTO_LANGUAGE) return toLanguageTag(currentLanguage);
  return getUILanguage();
}

/** A byte count in kilobytes with at most one decimal, e.g. "12.5 KB". */
export function formatKilobytes(bytes: number): string {
  const kilobytes = Math.round((bytes / BYTES_PER_KB) * 10) / 10;
  let value: string;
  try {
    value = kilobytes.toLocaleString(getFormattingLocale());
  } catch {
    value = String(kilobytes);
  }
  return `${value} ${t('unit_kb')}`;
}

/** A 0–1 ratio as a whole percentage in the extension's language, e.g. "85%". */
export function formatPercent(ratio: number): string {
  const options: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 0 };
  try {
    return new Intl.NumberFormat(getFormattingLocale(), options).format(ratio);
  } catch {
    return new Intl.NumberFormat(undefined, options).format(ratio);
  }
}

/** Items joined as a list in the extension's language, e.g. "A, B, and C" or "A、B、C". */
export function formatList(items: readonly string[]): string {
  try {
    return new Intl.ListFormat(getFormattingLocale()).format(items);
  } catch {
    return new Intl.ListFormat().format(items);
  }
}

/**
 * The first `limit` items as a list, with the rest counted as its last entry, e.g.
 * "A, B, and 3 more".
 */
export function formatListPreview(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit);
  const more = items.length - shown.length;
  return formatList(more > 0 ? [...shown, t('format_moreItems', String(more))] : shown);
}

/** Date and time in the extension's language, e.g. "2026/9/24 15:05:49" in Japanese. */
export function formatDateTime(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return date.toLocaleString(getFormattingLocale());
  } catch {
    // An unsupported locale tag falls back to the runtime default.
    return date.toLocaleString();
  }
}

export type MessageKey = string;

/**
 * Mirrors chrome.i18n.getMessage formatting for bundled messages: named `$name$` placeholders
 * (case-insensitive) expand to their `content`, then `$1`-`$9` take substitutions and `$$`
 * becomes `$`. Missing substitutions render as empty strings, as in Chrome.
 */
export function formatBundledMessage(
  entry: BundledMessage,
  substitutions?: string | string[],
): string {
  const subs = substitutions === undefined ? [] : [substitutions].flat();
  const placeholders = new Map(
    Object.entries(entry.placeholders ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      value.content,
    ]),
  );
  return entry.message
    .replace(/\$([A-Za-z0-9_@]+)\$/g, (match, name: string) => {
      return placeholders.get(name.toLowerCase()) ?? match;
    })
    .replace(/\$(\$|[1-9])/g, (_match, token: string) =>
      token === '$' ? '$' : (subs[Number(token) - 1] ?? ''),
    );
}

/**
 * A message in the language `t()` shows, or undefined when no locale defines the key. Loaded
 * messages come first (a selected language, or 'auto' showing a locale the browser does not
 * serve); otherwise, and for a key a loaded locale lacks, `browser.i18n.getMessage`.
 */
function lookupMessage(key: MessageKey, substitutions?: string | string[]): string | undefined {
  try {
    const entry = messagesLocale && loadedMessages[messagesLocale]?.[key];
    if (entry) return formatBundledMessage(entry, substitutions);
    // WXT types getMessage with the generated key union; keys here are checked against every
    // locale by tests/unit/locale-messages.test.ts instead.
    const message = browser.i18n.getMessage(
      key as Parameters<typeof browser.i18n.getMessage>[0],
      substitutions,
    );
    return message || undefined;
  } catch {
    // Non-extension environments (unit tests) have no browser.i18n.
    return undefined;
  }
}

/** Get a localized message, or the key itself when no locale defines it. */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  return lookupMessage(key, substitutions) ?? key;
}

/** A message to show for a caught error: its own message, or the localized fallback. */
export function getErrorMessage(error: unknown, fallbackKey: MessageKey = 'error_unknown'): string {
  return error instanceof Error ? error.message : t(fallbackKey);
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** The CLDR plural category of a count in the language shown: 'one', 'few', 'other', and so on. */
export function getPluralCategory(count: number): Intl.LDMLPluralRule {
  const tag = toLanguageTag(getResolvedLanguage());
  try {
    let rules = pluralRules.get(tag);
    if (!rules) {
      rules = new Intl.PluralRules(tag);
      pluralRules.set(tag, rules);
    }
    return rules.select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/**
 * Count-aware message lookup. `<key>` holds the general ('other') form and `<key>_<category>`
 * each other form the language needs (`_one` in English; `_one`, `_few`, `_many` in
 * Russian), picked by `Intl.PluralRules`; a missing form falls back to `<key>`. The count is
 * always the first substitution.
 */
export function tPlural(key: MessageKey, count: number, extra: string[] = []): string {
  const substitutions = [String(count), ...extra];
  const category = getPluralCategory(count);
  const form = category === 'other' ? undefined : lookupMessage(`${key}_${category}`, substitutions);
  return form ?? t(key, substitutions);
}
