/**
 * Settings storage using @webext-core/storage.
 * Type-safe storage wrapper with React hooks.
 */

import { useEffect, useState, useCallback } from 'react';
import { type Settings, defaultSettings, settingsSchema } from './settings-schema';

// Storage key for settings
const SETTINGS_KEY = 'bookmark-scout-settings';

/**
 * Get settings from chrome.storage.sync.
 */
export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      console.warn('Chrome storage API not available, using defaults');
      resolve(defaultSettings);
      return;
    }

    chrome.storage.sync.get(SETTINGS_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error reading settings:', chrome.runtime.lastError);
        resolve(defaultSettings);
        return;
      }

      const stored = result[SETTINGS_KEY];
      if (!stored) {
        resolve(defaultSettings);
        return;
      }

      // Validate and merge with defaults
      const parsed = settingsSchema.safeParse({ ...defaultSettings, ...stored });
      if (parsed.success) {
        resolve(parsed.data);
      } else {
        console.warn('Invalid settings, using defaults:', parsed.error);
        resolve(defaultSettings);
      }
    });
  });
}

/**
 * Save settings to chrome.storage.sync.
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.sync) {
      console.warn('Chrome storage API not available');
      resolve();
      return;
    }

    // Merge with existing settings
    getSettings().then((current) => {
      const merged = { ...current, ...settings };
      const parsed = settingsSchema.safeParse(merged);

      if (!parsed.success) {
        reject(new Error(`Invalid settings: ${parsed.error.message}`));
        return;
      }

      chrome.storage.sync.set({ [SETTINGS_KEY]: parsed.data }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  });
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

    // Listen for storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'sync' && changes[SETTINGS_KEY]) {
        const newSettings = changes[SETTINGS_KEY].newValue;
        if (newSettings) {
          const parsed = settingsSchema.safeParse({ ...defaultSettings, ...newSettings });
          if (parsed.success) {
            setSettings(parsed.data);
          }
        }
      }
    };

    chrome?.storage?.onChanged?.addListener(handleStorageChange);
    return () => {
      chrome?.storage?.onChanged?.removeListener(handleStorageChange);
    };
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
