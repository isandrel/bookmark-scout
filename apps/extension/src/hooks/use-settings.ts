/**
 * React hooks over the settings in `lib/settings-storage.ts`, which stays free of React for the
 * background.
 */

import { useCallback } from 'react';

/**
 * All settings for React. Every caller on a page shares one stored copy, read once and followed
 * by one watcher, so changes from any page or device re-render the page without remounting it.
 */
export function useSettings(): {
  settings: Settings;
  isLoading: boolean;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  /** Resolves to what the reset changed, for `undoResetSettings`. */
  resetToDefaults: () => Promise<SettingsReset>;
} {
  const { value: settings, isLoading } = useStoredValue(settingsValue);
  return { settings, isLoading, updateSettings: saveSettings, resetToDefaults: resetSettings };
}

/**
 * One setting for React, from the page's shared settings; re-renders only when it changes.
 */
export function useSetting<K extends keyof Settings>(
  key: K,
): {
  value: Settings[K];
  isLoading: boolean;
  setValue: (value: Settings[K]) => Promise<void>;
} {
  const select = useCallback((settings: Settings) => settings[key], [key]);
  const { value, isLoading } = useStoredValue(settingsValue, select);
  const setValue = useCallback(
    (next: Settings[K]) => saveSettings({ [key]: next } as Partial<Settings>),
    [key],
  );
  return { value, isLoading, setValue };
}
