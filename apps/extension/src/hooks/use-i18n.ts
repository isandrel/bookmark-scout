/**
 * i18n hook with language override support.
 * When language = 'auto': uses browser.i18n.getMessage
 * When specific language: loads from bundled messages
 */

// Import message files at build time for custom language support
import browser from 'webextension-polyfill';
import messagesEn from '../../public/_locales/en/messages.json';
import messagesJa from '../../public/_locales/ja/messages.json';
import messagesKo from '../../public/_locales/ko/messages.json';

// Bundled messages map
const messagesMap: Record<string, Record<string, { message: string }>> = {
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

export type MessageKey = string;

/**
 * Get localized message.
 * - When language = 'auto': uses browser.i18n.getMessage (follows browser settings)
 * - When specific language: returns from bundled messages
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  try {
    // Use bundled messages when specific language is selected
    if (currentLanguage !== 'auto') {
      const messages = messagesMap[currentLanguage];
      if (messages?.[key]) {
        let message = messages[key].message;
        // Handle substitutions ($1, $2, etc.)
        if (substitutions) {
          const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
          subs.forEach((sub, i) => {
            message = message.replace(`$${i + 1}`, sub);
          });
        }
        return message;
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
 * Hook for using i18n in React components
 * Returns the t function for translations
 */
export function useI18n() {
  return { t };
}
