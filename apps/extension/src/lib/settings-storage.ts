/**
 * Settings storage. Only settings that differ from their default are stored: synced ones in
 * `STORAGE_ITEMS.settings`, this device's own (`DEVICE_SETTING_KEYS`) in
 * `STORAGE_ITEMS.deviceSettings`. Saving a setting back to its default removes it. Invalid stored
 * or submitted fields are isolated so one bad value never blocks the rest.
 */

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

/** Settings that differ from the default, as stored, including keys a newer release added. */
export type StoredOverrides = Record<string, unknown>;

const parseOverrides = (raw: unknown): StoredOverrides => (isPlainObject(raw) ? raw : {});

/** What each scope stores; read settings through `settingsValue`, change them through `saveSettings`. */
export const settingsOverrideValues: Record<SettingScope, StoredValue<StoredOverrides>> = {
  sync: defineStoredValue<StoredOverrides>(STORAGE_ITEMS.settings, {
    parse: parseOverrides,
    empty: {},
    isEmpty: (overrides) => Object.keys(overrides).length === 0,
  }),
  device: defineStoredValue<StoredOverrides>(STORAGE_ITEMS.deviceSettings, {
    parse: parseOverrides,
    empty: {},
    isEmpty: (overrides) => Object.keys(overrides).length === 0,
  }),
};

/** Valid settings from what each scope stores; a key stored in the wrong scope is ignored. */
function composeSettings(sync: StoredOverrides, device: StoredOverrides): Settings {
  const pick = (overrides: StoredOverrides, scope: SettingScope) =>
    Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => isSettingsKey(key) && getSettingScope(key) === scope,
      ),
    );
  return sanitizeSettings({ ...pick(sync, 'sync'), ...pick(device, 'device') });
}

/**
 * What a scope stores after a change from `before` to `after`: changed settings are stored, or
 * removed when back at their default; everything else stays as stored, so a setting another
 * release understands better (a newer option, a newer key) survives this release's writes.
 */
function nextOverrides(
  stored: StoredOverrides,
  scope: SettingScope,
  before: Settings,
  after: Settings,
): StoredOverrides {
  const next = { ...stored };
  for (const key of SETTING_KEYS_BY_SCOPE[scope]) {
    if (isSameJson(after[key], before[key])) continue;
    if (isSameJson(after[key], defaultSettings[key])) delete next[key];
    else next[key] = after[key];
  }
  return next;
}

/**
 * Every setting, from both scopes. Every read or change also sets the language `t()` uses, so a
 * page follows a language change made anywhere.
 */
export const settingsValue = defineDerivedValue(
  [settingsOverrideValues.sync, settingsOverrideValues.device] as const,
  ([sync, device]) => {
    const settings = composeSettings(sync, device);
    setLanguage(settings.language);
    return settings;
  },
  defaultSettings,
);

/**
 * Applies `change` to the current settings and stores the result in both scopes, each under its
 * own lock (synced first, then this device's, in that order everywhere). Nothing is stored when
 * `change` throws. Resolves to the settings before and after.
 */
async function changeSettings(
  change: (current: Settings) => Settings,
  storeScope: (
    scope: SettingScope,
    stored: StoredOverrides,
    before: Settings,
    after: Settings,
  ) => StoredOverrides = (scope, stored, before, after) =>
    nextOverrides(stored, scope, before, after),
): Promise<{ before: Settings; after: Settings }> {
  let result: { before: Settings; after: Settings } | undefined;
  await settingsOverrideValues.sync.update(async (sync) => {
    let nextSync = sync;
    await settingsOverrideValues.device.update((device) => {
      const before = composeSettings(sync, device);
      const after = change(before);
      result = { before, after };
      nextSync = storeScope('sync', sync, before, after);
      return storeScope('device', device, before, after);
    });
    return nextSync;
  });
  if (!result) throw new Error('Settings were not changed');
  return result;
}

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
  await changeSettings((current) => {
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
  const { after } = await changeSettings((current) => {
    const result = validateSettingsUpdate(current, updates);
    errors = result.errors;
    return result.settings;
  });
  return { settings: after, errors };
}

/** Message `type` of a save a closing page hands to the background. */
const SAVE_SETTINGS_MESSAGE = 'settings/save';

/**
 * Saves every valid field in `updates` from a page that is about to close or reload. A save in the
 * page itself waits for the storage lock and a read, which an unloading page never finishes; the
 * message leaves at once and the background saves it. Nothing is reported back.
 */
export function saveSettingsFromClosingPage(updates: Partial<Settings>): void {
  void browser.runtime
    .sendMessage({ type: SAVE_SETTINGS_MESSAGE, updates })
    .catch((error) => settingsLogger.error({ error }, 'Failed to hand settings to the background'));
}

/** Background: saves what closing extension pages send. Call once, synchronously, at startup. */
export function registerSettingsSaveListener(): void {
  browser.runtime.onMessage.addListener((message, sender) => {
    if (!isPlainObject(message) || message.type !== SAVE_SETTINGS_MESSAGE) return undefined;
    // Only the extension's own pages, not scripts it injects into web pages.
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/'))) {
      return undefined;
    }
    if (!isPlainObject(message.updates)) return undefined;
    void saveValidSettings(message.updates as Partial<Settings>).catch((error) => {
      settingsLogger.error({ error }, 'Failed to save settings from a closing page');
    });
    return undefined;
  });
}

/**
 * Reset every setting this release knows to its default, in both scopes.
 */
export async function resetSettings(): Promise<void> {
  await changeSettings(
    () => defaultSettings,
    (scope, stored) =>
      Object.fromEntries(
        Object.entries(stored).filter(
          ([key]) => !isSettingsKey(key) || getSettingScope(key) !== scope,
        ),
      ),
  );
}

/**
 * Import settings from a JSON string, merging recognized fields onto the current settings.
 * Rejects the whole file if it is not a settings object or any recognized field is invalid. An
 * empty object (an export of default settings) changes nothing.
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
  // An export of default settings is empty; a file with only unknown keys is something else.
  if (Object.keys(updates).length === 0 && Object.keys(parsed).length > 0) {
    throw new Error(t('error_invalidSettingsFile'));
  }

  const { before, after } = await changeSettings((current) => {
    const { settings, errors } = validateSettingsUpdate(current, updates);
    if (Object.keys(errors).length > 0) throw new SettingsValidationError(errors);
    return settings;
  });
  return (Object.keys(after) as (keyof Settings)[]).filter(
    (key) => !isSameJson(after[key], before[key]),
  );
}

/**
 * Call `listener` with sanitized settings whenever settings change (any page or device).
 */
export function subscribeToSettings(listener: (settings: Settings) => void): () => void {
  return settingsValue.watch(listener);
}
