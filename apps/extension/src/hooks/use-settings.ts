/**
 * React hooks over the settings in `lib/settings-storage.ts`, which stays free of React for the
 * background.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
 * One setting for React, from the page's shared settings; re-renders only when it changes. A value
 * being saved is shown until the stored value follows it (the storage watcher reports a save after
 * it finished), so a second quick change, such as a click on the next checkbox of a list, builds
 * on the first instead of on a stored value that has not caught up yet.
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
  /** The last value saved, the stored value it started from, and whether its save finished. */
  const [saving, setSaving] = useState<
    { value: Settings[K]; from: Settings[K]; done: boolean } | undefined
  >();
  const stored = useRef(value);
  stored.current = value;
  const latest = useRef(0);
  const setValue = useCallback(
    async (next: Settings[K]) => {
      const save = ++latest.current;
      setSaving({ value: next, from: stored.current, done: false });
      try {
        await saveSettings({ [key]: next } as Partial<Settings>);
      } catch (error) {
        if (save === latest.current) setSaving(undefined);
        throw error;
      }
      // Only the last save counts; an earlier one finishing must not bring back an older value.
      if (save === latest.current) setSaving((current) => current && { ...current, done: true });
    },
    [key],
  );
  const caughtUp = saving?.done === true && !isSameJson(value, saving.from);
  useEffect(() => {
    if (caughtUp) setSaving(undefined);
  }, [caughtUp]);
  return { value: saving && !caughtUp ? saving.value : value, isLoading, setValue };
}
