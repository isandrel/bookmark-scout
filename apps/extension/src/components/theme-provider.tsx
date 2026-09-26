/**
 * Theme provider built on next-themes. The synced `theme` setting is the single source of truth:
 * every page applies it on load and whenever it changes (Options, popup, another device, import).
 * next-themes' localStorage entry only caches it to avoid a flash on first paint.
 */

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Applies the synced setting and keeps next-themes' localStorage cache out of cross-page sync.
 * next-themes also follows `storage` events for its cache key, but those arrive late and out of
 * order across pages (each page rewrites the cache), so a stale value could override the setting.
 */
function SettingsThemeSync({ storageKey }: { storageKey: string }) {
  const { setTheme } = useNextTheme();
  const setThemeRef = useRef(setTheme);
  setThemeRef.current = setTheme;

  useEffect(() => {
    let active = true;
    const apply = (settings: Settings) => {
      if (active) setThemeRef.current(settings.theme);
    };
    void getSettings().then(apply);
    const unsubscribe = subscribeToSettings(apply);
    // Capture runs before next-themes' own listener on window.
    const ignoreCacheEvent = (event: StorageEvent) => {
      if (event.key === storageKey) event.stopImmediatePropagation();
    };
    window.addEventListener('storage', ignoreCacheEvent, { capture: true });
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('storage', ignoreCacheEvent, { capture: true });
    };
  }, [storageKey]);

  return null;
}

export function ThemeProvider({ children, storageKey = 'theme', ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={storageKey}
      {...props}
    >
      <SettingsThemeSync storageKey={storageKey} />
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
