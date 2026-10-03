/** Locale keys of the units settings declare (`unit` in lib/settings-schema.ts). */
export const SETTING_UNIT_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  ms: 'settings_unitMilliseconds',
  px: 'settings_unitPixels',
  chars: 'settings_unitCharacters',
  KB: 'settings_unitKilobytes',
};

/** A setting's unit in the current language; an unknown unit is shown as declared. */
export function getSettingUnitLabel(unit: string): string {
  const key = SETTING_UNIT_LABEL_KEYS[unit];
  return key ? t(key) : unit;
}
