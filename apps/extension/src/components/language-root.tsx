import { type ReactNode, useEffect } from 'react';

/**
 * Keeps `<html lang>` in step with the language shown. Strings themselves follow a language
 * change without a reload: every page root reads settings, so a change re-renders the page,
 * and `t()` reads the language set by the settings watcher. Re-rendering instead of remounting
 * keeps open sidebars, dialogs, and typed text.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  // Reading settings has already applied the language when this value changes.
  const { value: language, isLoading } = useSetting('language');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `language` re-runs it; the resolved language comes from the settings read.
  useEffect(() => {
    if (!isLoading) document.documentElement.lang = getResolvedLanguage();
  }, [isLoading, language]);

  return children;
}
