import { type ReactNode, useEffect } from 'react';

/**
 * Keeps `<html lang>` in step with the language shown. Strings themselves follow a language
 * change without a reload: every page root reads settings, so a change re-renders the page,
 * and `t()` reads the language set by the settings watcher. Re-rendering instead of remounting
 * keeps open sidebars, dialogs, and typed text.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    let active = true;
    const apply = () => {
      if (active) document.documentElement.lang = getResolvedLanguage();
    };
    const unsubscribe = subscribeToSettings(apply);
    void getSettings().then(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return children;
}
