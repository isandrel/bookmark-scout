/**
 * React hooks over the language state in `use-i18n.ts`, kept apart so that `t()` and the rest of
 * that file stay free of React for the background.
 */

import { useSyncExternalStore } from 'react';

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
