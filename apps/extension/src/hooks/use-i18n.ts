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
 * A language the extension ships messages for. Types cannot list folders, so a new
 * `_locales/<locale>/` folder also goes here; tests/unit/locale-messages.test.ts fails until it does.
 */
export type SupportedLocale = 'en' | 'ja' | 'ko';

/** Bundled locales (one per `_locales/` folder) in the order the Language setting lists them. */
export const SUPPORTED_LOCALES = Object.keys(localeNames) as SupportedLocale[];

/** Shown when the browser language is not bundled; the manifest's `default_locale` (unit-tested). */
export const FALLBACK_LOCALE: SupportedLocale = 'en';

/** The Language setting's value for "follow the browser". */
export const AUTO_LANGUAGE = 'auto';

export type LanguagePreference = typeof AUTO_LANGUAGE | SupportedLocale;

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
let languageReady: Promise<void> = Promise.resolve();
const languageListeners = new Set<() => void>();

function applyLanguage(language: LanguagePreference) {
  if (currentLanguage === language) return;
  currentLanguage = language;
  for (const listener of [...languageListeners]) listener();
}

/**
 * The bundled locale `browser.i18n.getMessage` shows: the browser UI language (`ja-JP` uses
 * `ja`) when it is bundled, otherwise the manifest's `default_locale`. Undefined outside the
 * extension (unit tests).
 */
function getBrowserLocale(): SupportedLocale | undefined {
  try {
    const uiLanguage = browser.i18n.getUILanguage().toLowerCase().replace('_', '-');
    return (
      SUPPORTED_LOCALES.find(
        (locale) => uiLanguage === locale || uiLanguage.startsWith(`${locale}-`),
      ) ?? FALLBACK_LOCALE
    );
  } catch {
    return undefined;
  }
}

/**
 * Select the language. Called by settings storage on load/change. Applies at once when `t()`
 * can already show it ('auto', a loaded locale, or the browser's own locale, which
 * `browser.i18n` serves), otherwise after its messages load; `whenLanguageReady` waits for that.
 */
export function setLanguage(language: LanguagePreference) {
  requestedLanguage = language;
  if (language === AUTO_LANGUAGE || loadedMessages[language] || language === getBrowserLocale()) {
    applyLanguage(language);
    languageReady = Promise.resolve();
    return;
  }
  languageReady = loadLocaleMessages(language).then(() => {
    // A later selection wins over this one.
    if (requestedLanguage === language) applyLanguage(language);
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
 * The bundled language actually shown: the explicit setting, or for 'auto' the browser UI
 * language when it is one of the bundled locales, otherwise English.
 */
export function getResolvedLanguage(): SupportedLocale {
  if (currentLanguage !== AUTO_LANGUAGE) return currentLanguage;
  // Non-extension environments (tests) fall back to the default locale.
  return getBrowserLocale() ?? FALLBACK_LOCALE;
}

/**
 * Locale for dates and numbers: the selected language, or for 'auto' the browser UI language
 * (undefined outside the extension, which means the runtime default).
 */
export function getFormattingLocale(): string | undefined {
  if (currentLanguage !== AUTO_LANGUAGE) return currentLanguage;
  try {
    return browser.i18n.getUILanguage() || undefined;
  } catch {
    return undefined;
  }
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
 * Get localized message.
 * - When language = 'auto': uses browser.i18n.getMessage (follows browser settings)
 * - When specific language: returns from its loaded messages (the browser's own locale is not
 *   loaded; browser.i18n serves it)
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  try {
    // Use the loaded messages when a specific language is selected
    if (currentLanguage !== AUTO_LANGUAGE) {
      const entry = loadedMessages[currentLanguage]?.[key];
      if (entry) {
        return formatBundledMessage(entry, substitutions);
      }
      // Fall through to browser.i18n if key not found
    }

    // Default: use browser.i18n.getMessage (auto-detects from browser)
    // WXT types getMessage with the generated key union; keys here are checked against every
    // locale by tests/unit/locale-messages.test.ts instead.
    const message = browser.i18n.getMessage(
      key as Parameters<typeof browser.i18n.getMessage>[0],
      substitutions,
    );
    return message || key;
  } catch {
    // Fallback for non-extension environments (like tests)
    return key;
  }
}

/** A message to show for a caught error: its own message, or the localized fallback. */
export function getErrorMessage(error: unknown, fallbackKey: MessageKey = 'error_unknown'): string {
  return error instanceof Error ? error.message : t(fallbackKey);
}

/**
 * Count-aware message lookup. `<key>_one` holds the singular form (identical to `<key>` in
 * locales without grammatical number); the count is always the first substitution.
 */
export function tPlural(key: MessageKey, count: number, extra: string[] = []): string {
  const substitutions = [String(count), ...extra];
  return t(count === 1 ? `${key}_one` : key, substitutions);
}
