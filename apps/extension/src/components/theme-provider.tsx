/**
 * Theme provider built on next-themes. The synced `theme` setting is the single source of truth:
 * every page applies it on load and whenever it changes (Options, popup, another device, import).
 * next-themes' localStorage entry only caches it to avoid a flash on first paint.
 */

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';
import { useCallback, useEffect } from 'react';

function SettingsThemeSync() {
  const { setTheme } = useNextTheme();

  useEffect(() => {
    let active = true;
    void getSettings().then((settings) => {
      if (active) setTheme(settings.theme);
    });
    const unsubscribe = subscribeToSettings((settings) => setTheme(settings.theme));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [setTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <SettingsThemeSync />
      {children}
    </NextThemesProvider>
  );
}

/**
 * next-themes' useTheme, except setTheme persists to the synced setting so every open page follows.
 */
export function useTheme() {
  const nextTheme = useNextTheme();
  const applyTheme = nextTheme.setTheme;

  const setTheme = useCallback(
    (theme: string) => {
      const parsed = themeSchema.safeParse(theme);
      if (!parsed.success) return;
      applyTheme(parsed.data);
      void saveSettings({ theme: parsed.data }).catch((error) => {
        console.error('Failed to save theme setting:', error);
      });
    },
    [applyTheme],
  );

  return { ...nextTheme, setTheme };
}
