import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Remounts the page when the language setting changes, so every string, memoized label, and
 * toast is rebuilt in the new language without a manual reload. Also keeps `<html lang>` in step
 * with the language shown.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const languageRef = useRef<Settings['language'] | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    const apply = (settings: Settings) => {
      if (!active) return;
      const previous = languageRef.current;
      languageRef.current = settings.language;
      document.documentElement.lang = getResolvedLanguage();
      // The first value only records the language; remount on later changes.
      if (previous !== null && previous !== settings.language) {
        setGeneration((current) => current + 1);
      }
    };
    const unsubscribe = subscribeToSettings(apply);
    void getSettings().then((settings) => {
      if (languageRef.current === null) apply(settings);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return <Fragment key={generation}>{children}</Fragment>;
}
