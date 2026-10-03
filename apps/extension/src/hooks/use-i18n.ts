/**
 * i18n hook with language override support.
 * When language = 'auto': uses browser.i18n.getMessage
 * When specific language: loads from bundled messages
 */

// Import message files at build time for custom language support
import messagesEn from '../../public/_locales/en/messages.json';
import messagesJa from '../../public/_locales/ja/messages.json';
import messagesKo from '../../public/_locales/ko/messages.json';

export type BundledMessage = {
  message: string;
  placeholders?: Record<string, { content: string }>;
};

const bundledMessages = { en: messagesEn, ja: messagesJa, ko: messagesKo };

/** A language the extension ships messages for; adding a locale file here adds it everywhere. */
export type SupportedLocale = keyof typeof bundledMessages;

const messagesMap: Record<SupportedLocale, Record<string, BundledMessage>> = bundledMessages;

/** Bundled locales in the order the Language setting lists them. */
export const SUPPORTED_LOCALES = Object.keys(messagesMap) as SupportedLocale[];

/** Shown when the browser language is not bundled; the manifest's `default_locale` (unit-tested). */
export const FALLBACK_LOCALE: SupportedLocale = 'en';

/** The Language setting's value for "follow the browser". */
export const AUTO_LANGUAGE = 'auto';

export type LanguagePreference = typeof AUTO_LANGUAGE | SupportedLocale;

// Current language setting (updated by settings storage)
let currentLanguage: LanguagePreference = AUTO_LANGUAGE;

/**
 * Set the current language. Called by settings storage on load/change.
 */
export function setLanguage(language: LanguagePreference) {
  currentLanguage = language;
}

/** A language's own name ("日本語"), from that locale's `meta_languageName` message. */
export function getLanguageName(locale: SupportedLocale): string {
  return messagesMap[locale].meta_languageName?.message ?? locale;
}

/**
 * Get the current language setting.
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * The bundled language actually shown: the explicit setting, or for 'auto' the browser UI
 * language when it is one of the bundled locales, otherwise English.
 */
export function getResolvedLanguage(): SupportedLocale {
  if (currentLanguage !== AUTO_LANGUAGE) return currentLanguage;
  try {
    const uiLanguage = browser.i18n.getUILanguage().toLowerCase();
    const match = SUPPORTED_LOCALES.find((locale) => uiLanguage.startsWith(locale));
    if (match) return match;
  } catch {
    // Non-extension environments (tests) fall back to the default locale.
  }
  return FALLBACK_LOCALE;
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
 * - When specific language: returns from bundled messages
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  try {
    // Use bundled messages when specific language is selected
    if (currentLanguage !== AUTO_LANGUAGE) {
      const entry = messagesMap[currentLanguage]?.[key];
      if (entry) {
        return formatBundledMessage(entry, substitutions);
      }
      // Fall through to browser.i18n if key not found
    }

    // Default: use browser.i18n.getMessage (auto-detects from browser)
    const message = browser.i18n.getMessage(key, substitutions);
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
