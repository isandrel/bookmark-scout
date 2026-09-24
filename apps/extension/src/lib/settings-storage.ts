/**
 * Settings storage backed by WXT storage in the sync area.
 * The stored object is a partial Settings record; reads merge it with defaults.
 */

import { useEffect, useState, useCallback } from 'react';

export const settingsStorageItem = storage.defineItem<Record<string, unknown>>(
  'sync:bookmark-scout-settings',
);

function parseStoredSettings(stored: unknown): Settings | null {
  if (!stored || typeof stored !== 'object') return null;
  const parsed = settingsSchema.safeParse({ ...defaultSettings, ...stored });
  if (!parsed.success) {
    console.warn('Invalid settings, using defaults:', parsed.error);
    return null;
  }
  return parsed.data;
}

/**
 * Get settings from sync storage.
 */
export async function getSettings(): Promise<Settings> {
  let stored: unknown;
  try {
    stored = await settingsStorageItem.getValue();
  } catch (error) {
    console.error('Error reading settings:', error);
    return defaultSettings;
  }

  const settings = parseStoredSettings(stored);
  if (!settings) return defaultSettings;
  setLanguage(settings.language);
  return settings;
}

/**
 * Save settings to sync storage.
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const parsed = settingsSchema.safeParse({ ...current, ...settings });
  if (!parsed.success) {
    throw new Error(`Invalid settings: ${parsed.error.message}`);
  }
  await settingsStorageItem.setValue(parsed.data);
}

/**
 * Reset settings to defaults.
 */
export async function resetSettings(): Promise<void> {
  return saveSettings(defaultSettings);
}

/**
 * Export settings as JSON string.
 */
export async function exportSettings(): Promise<string> {
  const settings = await getSettings();
  return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from JSON string.
 */
export async function importSettings(json: string): Promise<void> {
  const parsed = JSON.parse(json);
  const validated = settingsSchema.parse(parsed);
  await saveSettings(validated);
}

/**
 * React hook for all settings.
 * Returns current settings and a setter function.
 */
export function useSettings(): {
  settings: Settings;
  isLoading: boolean;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setIsLoading(false);
    });

    return settingsStorageItem.watch((newValue) => {
      const parsed = parseStoredSettings(newValue);
      if (parsed) {
        setLanguage(parsed.language);
        setSettings(parsed);
      }
    });
  }, []);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    await saveSettings(updates);
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(async () => {
    await resetSettings();
    setSettings(defaultSettings);
  }, []);

  return { settings, isLoading, updateSettings, resetToDefaults };
}

/**
 * React hook for a single setting.
 * Returns the current value and a setter function.
 */
export function useSetting<K extends keyof Settings>(
  key: K,
): {
  value: Settings[K];
  isLoading: boolean;
  setValue: (value: Settings[K]) => Promise<void>;
} {
  const { settings, isLoading, updateSettings } = useSettings();

  const setValue = useCallback(
    async (value: Settings[K]) => {
      await updateSettings({ [key]: value } as Partial<Settings>);
    },
    [key, updateSettings],
  );

  return {
    value: settings[key],
    isLoading,
    setValue,
  };
}
