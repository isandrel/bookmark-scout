/**
 * Settings storage backed by a WXT storage item in the sync area.
 * Invalid stored or submitted fields are isolated so one bad value never blocks the rest.
 */

import { useCallback } from 'react';
import type { z } from 'zod';

/** Localized, human-readable validation messages keyed by setting. */
export type SettingsFieldErrors = Partial<Record<keyof Settings, string>>;

export class SettingsValidationError extends Error {
  readonly fieldErrors: SettingsFieldErrors;

  constructor(fieldErrors: SettingsFieldErrors) {
    const meta = getSettingsFieldMeta();
    const labels = Object.keys(fieldErrors).map((key) => meta[key as keyof Settings]?.label ?? key);
    super(t('error_invalidSettingsFields', labels.join(', ')));
    this.name = 'SettingsValidationError';
    this.fieldErrors = fieldErrors;
  }
}

const MAX_VALIDATION_PASSES = 20;

const relatedSettingKeys: Partial<Record<keyof Settings, keyof Settings>> = {
  autoTaggingMinTags: 'autoTaggingMaxTags',
  aiMinItemsPerFolder: 'aiMaxItemsPerFolder',
};

function isSettingsKey(key: unknown): key is keyof Settings {
  return typeof key === 'string' && key in settingsSchema.shape;
}

/**
 * Translate a Zod issue for one setting into a message a user can act on.
 */
export function getSettingsErrorMessage(key: keyof Settings, issue?: z.core.$ZodIssue): string {
  const meta = getSettingsFieldMeta()[key];
  if (issue?.code === 'custom') return t('settings_errorMinExceedsMax');
  if (meta?.list === 'number') return t('settings_errorStatusCodes');
  if (meta?.type === 'number' && meta.min !== undefined && meta.max !== undefined) {
    return meta.unlimited
      ? t('settings_errorRangeOrUnlimited', [String(meta.min), String(meta.max)])
      : t('settings_errorRange', [String(meta.min), String(meta.max)]);
  }
  if (meta?.type === 'text') {
    if (issue?.code === 'too_small') return t('settings_errorRequired');
    if (issue?.code === 'too_big') return t('settings_errorTooLong', String(issue.maximum));
  }
  return t('settings_errorInvalidOption');
}

/**
 * Validate `updates` against `current`. Invalid fields fall back to their current value and are
 * reported; every valid field is kept.
 */
export function validateSettingsUpdate(
  current: Settings,
  updates: Record<string, unknown>,
): { settings: Settings; errors: SettingsFieldErrors } {
  const errors: SettingsFieldErrors = {};
  const candidate: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (isSettingsKey(key)) candidate[key] = value;
  }

  for (let pass = 0; pass < MAX_VALIDATION_PASSES; pass += 1) {
    const parsed = settingsSchema.safeParse(candidate);
    if (parsed.success) return { settings: parsed.data, errors };

    let reverted = false;
    const revert = (key: keyof Settings, issue: z.core.$ZodIssue) => {
      const changed = key in updates && !isSameJson(candidate[key], current[key]);
      if (key in updates && !(key in errors)) errors[key] = getSettingsErrorMessage(key, issue);
      const fallback = changed ? current[key] : defaultSettings[key];
      if (!isSameJson(candidate[key], fallback)) {
        candidate[key] = fallback;
        reverted = true;
      }
    };

    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (!isSettingsKey(key)) continue;
      // Cross-field rules are reported on one key; revert whichever side the update touched.
      const related = [key, relatedSettingKeys[key]].filter(
        (item): item is keyof Settings => item !== undefined && item in updates,
      );
      if (issue.code === 'custom' && related.length > 0) {
        for (const item of related) revert(item, issue);
      } else {
        revert(key, issue);
      }
    }
    if (!reverted) break;
  }

  return { settings: current, errors };
}

/**
 * Coerce stored data into valid settings, replacing only invalid fields with defaults.
 */
export function sanitizeSettings(stored: unknown): Settings {
  const input = isPlainObject(stored) ? stored : {};
  return validateSettingsUpdate(defaultSettings, input).settings;
}

/**
 * Synced settings. Stored data may predate the current schema, so every read is sanitized, and
 * every read or change also sets the language `t()` uses, so a page follows a language change
 * made anywhere.
 */
export const settingsValue = defineStoredValue<Settings>({
  key: STORAGE_KEYS.settings,
  parse: (raw) => {
    const settings = sanitizeSettings(raw);
    setLanguage(settings.language);
    return settings;
  },
  empty: defaultSettings,
});

/**
 * Get settings from sync storage; defaults when storage cannot be read.
 */
export async function getSettings(): Promise<Settings> {
  try {
    return await settingsValue.get();
  } catch (error) {
    settingsLogger.error({ error }, 'Error reading settings');
    return defaultSettings;
  }
}

/**
 * Save settings. Rejects with SettingsValidationError when any field is invalid; nothing is saved.
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await settingsValue.update((current) => {
    const { settings: next, errors } = validateSettingsUpdate(current, settings);
    if (Object.keys(errors).length > 0) throw new SettingsValidationError(errors);
    return next;
  });
}

/**
 * Save every valid field in `updates` and report the invalid ones instead of discarding them.
 */
export async function saveValidSettings(
  updates: Partial<Settings>,
): Promise<{ settings: Settings; errors: SettingsFieldErrors }> {
  let errors: SettingsFieldErrors = {};
  const settings = await settingsValue.update((current) => {
    const result = validateSettingsUpdate(current, updates);
    errors = result.errors;
    return result.settings;
  });
  return { settings, errors };
}

/**
 * Like `saveValidSettings`, but validates against `current` (the latest known stored settings)
 * instead of reading storage first, so the write starts right away. Use it when the page may
 * unload before an extra storage round trip completes.
 */
export function saveValidSettingsNow(
  current: Settings,
  updates: Partial<Settings>,
): { settings: Settings; errors: SettingsFieldErrors; saved: Promise<void> } {
  const result = validateSettingsUpdate(current, updates);
  const saved = isSameJson(result.settings, current)
    ? Promise.resolve()
    : settingsValue.set(result.settings).then(() => undefined);
  return { ...result, saved };
}

/**
 * Reset settings to defaults.
 */
export async function resetSettings(): Promise<void> {
  await settingsValue.set(defaultSettings);
}

/**
 * Export settings as JSON string.
 */
export async function exportSettings(): Promise<string> {
  const settings = await getSettings();
  return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from a JSON string, merging recognized fields onto the current settings.
 * Rejects the whole file if it is not a settings object or any recognized field is invalid.
 * Returns the keys whose values changed.
 */
export async function importSettings(json: string): Promise<(keyof Settings)[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(t('error_invalidSettingsFile'));
  }
  if (!isPlainObject(parsed)) throw new Error(t('error_invalidSettingsFile'));

  const updates = Object.fromEntries(Object.entries(parsed).filter(([key]) => isSettingsKey(key)));
  if (Object.keys(updates).length === 0) throw new Error(t('error_invalidSettingsFile'));

  let changed: (keyof Settings)[] = [];
  await settingsValue.update((current) => {
    const { settings, errors } = validateSettingsUpdate(current, updates);
    if (Object.keys(errors).length > 0) throw new SettingsValidationError(errors);
    changed = (Object.keys(settings) as (keyof Settings)[]).filter(
      (key) => !isSameJson(settings[key], current[key]),
    );
    return settings;
  });
  return changed;
}

/**
 * Call `listener` with sanitized settings whenever synced settings change (any page or device).
 */
export function subscribeToSettings(listener: (settings: Settings) => void): () => void {
  return settingsValue.watch(listener);
}

/**
 * All settings for React. Every caller on a page shares one stored copy, read once and followed
 * by one watcher, so changes from any page or device re-render the page without remounting it.
 */
export function useSettings(): {
  settings: Settings;
  isLoading: boolean;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
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
