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

// Bundled messages map
const messagesMap: Record<string, Record<string, BundledMessage>> = {
  en: messagesEn,
  ja: messagesJa,
  ko: messagesKo,
};

// Current language setting (updated by settings storage)
let currentLanguage: 'auto' | 'en' | 'ja' | 'ko' = 'auto';

/**
 * Set the current language. Called by settings storage on load/change.
 */
export function setLanguage(language: 'auto' | 'en' | 'ja' | 'ko') {
  currentLanguage = language;
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
export function getResolvedLanguage(): 'en' | 'ja' | 'ko' {
  if (currentLanguage !== 'auto') return currentLanguage;
  try {
    const uiLanguage = browser.i18n.getUILanguage().toLowerCase();
    if (uiLanguage.startsWith('ja')) return 'ja';
    if (uiLanguage.startsWith('ko')) return 'ko';
  } catch {
    // Non-extension environments (tests) fall back to English.
  }
  return 'en';
}

/**
 * Locale for dates and numbers: the selected language, or for 'auto' the browser UI language
 * (undefined outside the extension, which means the runtime default).
 */
export function getFormattingLocale(): string | undefined {
  if (currentLanguage !== 'auto') return currentLanguage;
  try {
    return browser.i18n.getUILanguage() || undefined;
  } catch {
    return undefined;
  }
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
    if (currentLanguage !== 'auto') {
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

/**
 * Count-aware message lookup. `<key>_one` holds the singular form (identical to `<key>` in
 * locales without grammatical number); the count is always the first substitution.
 */
export function tPlural(key: MessageKey, count: number, extra: string[] = []): string {
  const substitutions = [String(count), ...extra];
  return t(count === 1 ? `${key}_one` : key, substitutions);
}

/**
 * Hook for using i18n in React components
 * Returns the t function for translations
 */
export function useI18n() {
  return { t };
}
