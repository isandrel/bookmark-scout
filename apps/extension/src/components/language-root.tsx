import { Children, cloneElement, isValidElement, type ReactNode, useEffect, useMemo } from 'react';

/**
 * Keeps `<html lang>` in step with the language shown, and re-renders the page when that language
 * changes. `t()` switches once the new language's messages have loaded, which can be after the
 * settings change that selected it, so this root re-renders its children itself: cloned elements
 * get new props, so each page re-renders with the new strings. Re-rendering instead of remounting
 * keeps open sidebars, dialogs, and typed text.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const language = useLanguage();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `language` re-runs it; 'auto' resolves to the browser language.
  useEffect(() => {
    document.documentElement.lang = getResolvedLanguage();
  }, [language]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: new elements for each language re-render the page; other parent renders reuse them.
  return useMemo(
    () => Children.map(children, (child) => (isValidElement(child) ? cloneElement(child) : child)),
    [children, language],
  );
}
